using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("大肥鱼桌宠")]
[assembly: AssemblyDescription("大肥鱼桌宠鲸鲸本地版")]
[assembly: AssemblyCompany("Local portable build; original pet by PC2005-cloud")]
[assembly: AssemblyProduct("大肥鱼桌宠")]
[assembly: AssemblyVersion("0.3.6.0")]
[assembly: AssemblyFileVersion("0.3.6.0")]

internal static class PetLauncher
{
    const string BuildId = "dsh-pet-0.3.6-persona-v2";
    static string root, runtime, data;
    static Process host;
    static int port;
    static IntPtr job;
    static NotifyIcon tray;
    static bool stopping;
    static bool background;
    static string localToken;
    static readonly object logLock = new object();
    static readonly JavaScriptSerializer json = new JavaScriptSerializer();

    [STAThread]
    static int Main(string[] args)
    {
        NormalizeEnvironment();
        if (Array.IndexOf(args, "--encrypt-key") >= 0 || Array.IndexOf(args, "--decrypt-key") >= 0)
        {
            try { string input = Console.In.ReadToEnd(); byte[] bytes;
                if (Array.IndexOf(args, "--encrypt-key") >= 0) {
                    bytes = ProtectedData.Protect(Encoding.UTF8.GetBytes(input), null, DataProtectionScope.CurrentUser);
                    Console.Out.Write(Convert.ToBase64String(bytes));
                } else {
                    bytes = ProtectedData.Unprotect(Convert.FromBase64String(input.Trim()), null, DataProtectionScope.CurrentUser);
                    Console.Out.Write(Encoding.UTF8.GetString(bytes));
                }
                return 0;
            } catch { return 1; }
        }
        if (Array.IndexOf(args, "--autostart-enable") >= 0 || Array.IndexOf(args, "--autostart-disable") >= 0)
        {
            try {
                string folder = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
                data = Path.GetPathRoot(folder).Equals("D:\\", StringComparison.OrdinalIgnoreCase) ? Path.Combine(folder, "数据") : @"D:\Codex\pets\大肥鱼完整版\数据";
                Directory.CreateDirectory(data);
                bool enabled = Array.IndexOf(args, "--autostart-enable") >= 0;
                ManageStartup(enabled); SaveStartupPreference(enabled); return 0;
            } catch { return 1; }
        }
        background = Array.IndexOf(args, "--background") >= 0;
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        string exeDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        root = exeDir;
        runtime = Path.Combine(exeDir, "资源");
        data = Path.GetPathRoot(exeDir).Equals("D:\\", StringComparison.OrdinalIgnoreCase)
            ? Path.Combine(exeDir, "数据") : @"D:\Codex\pets\大肥鱼完整版\数据";
        bool check = Array.IndexOf(args, "--check") >= 0;
        bool stop = Array.IndexOf(args, "--stop") >= 0;
        bool test = Array.IndexOf(args, "--test-mode") >= 0;
        if (stop) return StopExisting();
        bool created;
        string mutexName;
        using (SHA256 sha = SHA256.Create())
            mutexName = "Local\\DshPetPortable_" + BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(root.ToLowerInvariant()))).Replace("-", "").Substring(0, 24);
        using (Mutex mutex = new Mutex(true, mutexName, out created))
        {
            if (!created)
            {
                if (!check) MessageBox.Show("大肥鱼已经在运行。可在任务栏托盘找到大肥鱼图标。", "大肥鱼桌宠", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return 0;
            }
            try
            {
                Directory.CreateDirectory(data);
                Directory.CreateDirectory(Path.Combine(data, "logs"));
                if (check) EnsureRuntime(null); else ExtractWithProgress();
                InitializeConfig();
                if (check) return CheckRuntime();
                string tokenFile = Path.Combine(data, "local-access-token.txt");
                if (!File.Exists(tokenFile)) File.WriteAllText(tokenFile, Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N"));
                localToken = File.ReadAllText(tokenFile).Trim();
                ManageStartup(StartupDesired());
                RunPet(test);
                return 0;
            }
            catch (Exception e)
            {
                try { File.WriteAllText(Path.Combine(data, "logs", "launcher-error.txt"), e.ToString(), Encoding.UTF8); } catch { }
                if (!check) MessageBox.Show("启动失败：" + e.Message + "\n\n诊断日志：" + Path.Combine(data, "logs"), "大肥鱼桌宠", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
            finally
            {
                Shutdown();
                if (tray != null) { tray.Visible = false; tray.Dispose(); }
                if (job != IntPtr.Zero) { CloseHandle(job); job = IntPtr.Zero; }
                mutex.ReleaseMutex();
            }
        }
    }

    // Some development hosts pass duplicate casing (Path/PATH) in the Windows
    // environment block. .NET Framework rejects these when spawning a process.
    static void NormalizeEnvironment()
    {
        Dictionary<string, List<string>> keys = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        System.Collections.IDictionary values = Environment.GetEnvironmentVariables();
        foreach (object rawKey in values.Keys)
        {
            string key = (string)rawKey;
            if (!keys.ContainsKey(key)) keys[key] = new List<string>();
            keys[key].Add(key);
        }
        foreach (KeyValuePair<string, List<string>> entry in keys)
        {
            if (entry.Value.Count < 2) continue;
            string value = (string)values[entry.Value[0]];
            if (entry.Key.Equals("PATH", StringComparison.OrdinalIgnoreCase))
            {
                foreach (string key in entry.Value)
                {
                    string candidate = (string)values[key];
                    if (!value.Contains(candidate)) value += ";" + candidate;
                }
            }
            foreach (string key in entry.Value) Environment.SetEnvironmentVariable(key, null);
            Environment.SetEnvironmentVariable(entry.Value[0], value);
        }
    }

    static bool RuntimeReady()
    {
        string stamp = Path.Combine(runtime, "ready.txt");
        return File.Exists(stamp) && File.ReadAllText(stamp) == BuildId &&
            File.Exists(Path.Combine(runtime, "electron", "electron.exe")) &&
            File.Exists(Path.Combine(runtime, "pet", "lib", "standalone.js")) &&
            File.Exists(Path.Combine(runtime, "pet", "runtime", "electron-helper", "shared-core.js"));
    }

    static void ExtractWithProgress() { EnsureRuntime(null); }
    static void EnsureRuntime(Action<int> progress)
    {
        if (!RuntimeReady()) throw new FileNotFoundException("运行文件缺失，请完整解压压缩包后启动。请保留 EXE 旁的资源文件夹。");
    }
    static void InitializeConfig()
    {
        string configDir = Path.Combine(data, "dsh-pet");
        Directory.CreateDirectory(configDir);
        string config = Path.Combine(configDir, "main-config.jsonc");
        if (!File.Exists(config)) File.Copy(Path.Combine(runtime, "portable-defaults.jsonc"), config);
    }

    static ProcessStartInfo StartInfo(string arguments)
    {
        ProcessStartInfo info = new ProcessStartInfo(Path.Combine(runtime, "electron", "electron.exe"),
            "\"" + Path.Combine(runtime, "pet", "lib", "standalone.js") + "\" " + arguments);
        info.WorkingDirectory = Path.Combine(runtime, "pet");
        info.UseShellExecute = false; info.CreateNoWindow = true; info.WindowStyle = ProcessWindowStyle.Hidden;
        info.RedirectStandardOutput = true; info.RedirectStandardError = true;
        info.StandardOutputEncoding = Encoding.UTF8; info.StandardErrorEncoding = Encoding.UTF8;
        info.EnvironmentVariables["ELECTRON_RUN_AS_NODE"] = "1";
        info.EnvironmentVariables["DSH_HOME"] = data;
        info.EnvironmentVariables["DSH_PET_ELECTRON_PATH"] = Path.Combine(runtime, "electron", "electron.exe");
        info.EnvironmentVariables["DSH_PET_PORTABLE_DATA"] = data;
        info.EnvironmentVariables["DSH_PET_LAUNCHER"] = Assembly.GetExecutingAssembly().Location;
        info.EnvironmentVariables["DSH_PET_LOCAL_TOKEN"] = localToken ?? "";
        info.EnvironmentVariables["DSH_PET_SHOW_PANEL"] = background ? "0" : "1";
        foreach (string item in new string[] { "TEMP", "TMP", "APPDATA", "LOCALAPPDATA", "XDG_CACHE_HOME" })
        {
            string value = Path.Combine(data, item.ToLowerInvariant());
            Directory.CreateDirectory(value); info.EnvironmentVariables[item] = value;
        }
        return info;
    }

    static int CheckRuntime()
    {
        using (Process process = new Process())
        {
            process.StartInfo = StartInfo("--check");
            StringBuilder output = new StringBuilder();
            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) lock (output) output.AppendLine(e.Data); };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) lock (output) output.AppendLine(e.Data); };
            process.Start(); process.BeginOutputReadLine(); process.BeginErrorReadLine();
            if (!process.WaitForExit(30000)) { process.Kill(); throw new TimeoutException("运行环境检查超时。"); }
            process.WaitForExit();
            File.WriteAllText(Path.Combine(data, "logs", "check.txt"), output.ToString(), Encoding.UTF8);
            return process.ExitCode;
        }
    }

    static int FreePort()
    {
        TcpListener listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start(); int result = ((IPEndPoint)listener.LocalEndpoint).Port; listener.Stop(); return result;
    }

    static void RunPet(bool test)
    {
        File.WriteAllText(Path.Combine(data, "logs", "pet.log"), "大肥鱼桌宠启动 " + DateTime.Now.ToString("s") + "\n", Encoding.UTF8);
        port = FreePort();
        host = new Process { StartInfo = StartInfo("--port " + port) };
        int debugPort = test ? FreePort() : 0;
        int controlDebugPort = test ? FreePort() : 0;
        if (test) { host.StartInfo.EnvironmentVariables["DSH_PET_TEST_CDP_PORT"] = debugPort.ToString(); host.StartInfo.EnvironmentVariables["DSH_PET_CONTROL_CDP_PORT"] = controlDebugPort.ToString(); }
        host.OutputDataReceived += LogOutput; host.ErrorDataReceived += LogOutput;
        host.Start();
        CreateKillJob(host);
        host.BeginOutputReadLine(); host.BeginErrorReadLine();
        File.WriteAllText(Path.Combine(data, "runtime.json"), json.Serialize(new Dictionary<string, object> {
            { "localTokenFile", Path.Combine(data, "local-access-token.txt") }, { "launcherPid", Process.GetCurrentProcess().Id }, { "hostPid", host.Id }, { "port", port }, { "debugPort", debugPort }, { "controlDebugPort", controlDebugPort }, { "root", runtime }
        }), Encoding.UTF8);

        ContextMenuStrip menu = new ContextMenuStrip();
        menu.Items.Add("大肥鱼桌宠", null, delegate { });
        menu.Items[0].Enabled = false;
        menu.Items.Add("设置与聊天", null, delegate { PortableAction("open", "{}"); });
        menu.Items.Add("创建分身", null, delegate { PortableAction("clone", "{}"); });
        ToolStripMenuItem startup = new ToolStripMenuItem("开机自动启动") { CheckOnClick = true, Checked = StartupDesired() };
        startup.Click += delegate { try { ManageStartup(startup.Checked); SaveStartupPreference(startup.Checked); } catch (Exception e) { MessageBox.Show(e.Message, "自启动设置"); } };
        menu.Items.Add(startup);
        menu.Opening += delegate { startup.Checked = StartupDesired(); };
        menu.Items.Add("打开配置文件", null, delegate { OpenFile(Path.Combine(data, "dsh-pet", "main-config.jsonc")); });
        menu.Items.Add("打开数据文件夹", null, delegate { OpenFile(data); });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("退出大肥鱼", null, delegate { Shutdown(); Application.Exit(); });
        tray = new NotifyIcon { Icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location), Text = "大肥鱼桌宠", ContextMenuStrip = menu, Visible = true };
        System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer { Interval = 1000 };
        timer.Tick += delegate
        {
            if (host != null && host.HasExited && !stopping)
            {
                timer.Stop();
                if (host.ExitCode != 0) MessageBox.Show("大肥鱼已退出。可查看诊断日志：\n" + Path.Combine(data, "logs", "pet.log"), "大肥鱼桌宠");
                Application.Exit();
            }
        };
        timer.Start();
        Application.Run(new ApplicationContext());
        timer.Stop(); timer.Dispose(); menu.Dispose();
    }

    static bool StartupDesired()
    {
        string file = Path.Combine(data, "api-settings.json");
        if (!File.Exists(file)) return true;
        Dictionary<string, object> settings = json.Deserialize<Dictionary<string, object>>(File.ReadAllText(file));
        return !settings.ContainsKey("autoStart") || Convert.ToBoolean(settings["autoStart"]);
    }
    static void SaveStartupPreference(bool enabled)
    {
        string file = Path.Combine(data, "api-settings.json");
        Dictionary<string, object> settings = File.Exists(file) ? json.Deserialize<Dictionary<string, object>>(File.ReadAllText(file)) : new Dictionary<string, object>();
        settings["autoStart"] = enabled;
        File.WriteAllText(file, json.Serialize(settings), new UTF8Encoding(false));
    }
    static void ManageStartup(bool enabled)
    {
        if (Environment.GetEnvironmentVariable("DSH_PET_NO_AUTOSTART") == "1") return;
        using (RegistryKey key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run"))
        {
            if (enabled) key.SetValue("DshPetFull", "\"" + Assembly.GetExecutingAssembly().Location + "\" --background", RegistryValueKind.String);
            else key.DeleteValue("DshPetFull", false);
        }
    }
    static void PortableAction(string action, string body)
    {
        try
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + "/portable/api/" + action);
            request.Proxy = null; request.Method = "POST"; request.Timeout = 10000;
            request.ContentType = "application/json"; request.Headers["x-pet-token"] = localToken;
            byte[] payload = Encoding.UTF8.GetBytes(body); request.ContentLength = payload.Length;
            using (Stream stream = request.GetRequestStream()) stream.Write(payload, 0, payload.Length);
            using (WebResponse response = request.GetResponse()) { }
        }
        catch (Exception e) { MessageBox.Show("操作失败：" + e.Message, "大肥鱼桌宠"); }
    }

    static void OpenFile(string path) { Process.Start(new ProcessStartInfo(path) { UseShellExecute = true }); }

    static void LogOutput(object sender, DataReceivedEventArgs e)
    {
        if (e.Data == null) return;
        lock (logLock)
        {
            File.AppendAllText(Path.Combine(data, "logs", "pet.log"), e.Data + Environment.NewLine, Encoding.UTF8);
            Match m = Regex.Match(e.Data, @"http://127\.0\.0\.1:(\d+)/dsh-pet-7340/");
            if (m.Success) port = Int32.Parse(m.Groups[1].Value);
        }
    }

    static void Shutdown()
    {
        if (host == null || stopping) return;
        stopping = true;
        try
        {
            if (!host.HasExited)
            {
                SendShutdown(port);
                if (!host.WaitForExit(6000)) host.Kill();
            }
        }
        catch { try { if (!host.HasExited) host.Kill(); } catch { } }
        try { File.Delete(Path.Combine(data, "runtime.json")); } catch { }
        host.Dispose(); host = null;
    }

    static void SendShutdown(int targetPort)
    {
        HttpWebRequest request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + targetPort + "/shutdown");
        request.Proxy = null; request.Method = "POST"; request.ContentLength = 0; request.Timeout = 2000;
        using (WebResponse response = request.GetResponse()) { }
    }

    static int StopExisting()
    {
        try
        {
            string infoPath = Path.Combine(data, "runtime.json");
            if (!File.Exists(infoPath)) return 0;
            Dictionary<string, object> state = json.Deserialize<Dictionary<string, object>>(File.ReadAllText(infoPath));
            if ((string)state["root"] != runtime) return 1;
            Process running = Process.GetProcessById(Convert.ToInt32(state["hostPid"]));
            if (!running.MainModule.FileName.Equals(Path.Combine(runtime, "electron", "electron.exe"), StringComparison.OrdinalIgnoreCase)) return 1;
            SendShutdown(Convert.ToInt32(state["port"]));
            return running.WaitForExit(10000) ? 0 : 1;
        }
        catch { return 1; }
    }

    [StructLayout(LayoutKind.Sequential)] struct BasicLimit { public Int64 PerProcessUserTimeLimit, PerJobUserTimeLimit; public UInt32 LimitFlags; public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize; public UInt32 ActiveProcessLimit; public UIntPtr Affinity; public UInt32 PriorityClass, SchedulingClass; }
    [StructLayout(LayoutKind.Sequential)] struct IoCounters { public UInt64 ReadOperationCount, WriteOperationCount, OtherOperationCount, ReadTransferCount, WriteTransferCount, OtherTransferCount; }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimit { public BasicLimit BasicLimitInformation; public IoCounters IoInfo; public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed; }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr handle, int infoClass, IntPtr info, uint length);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr jobHandle, IntPtr processHandle);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    static void CreateKillJob(Process process)
    {
        job = CreateJobObject(IntPtr.Zero, null);
        ExtendedLimit limits = new ExtendedLimit(); limits.BasicLimitInformation.LimitFlags = 0x2000;
        int size = Marshal.SizeOf(typeof(ExtendedLimit)); IntPtr buffer = Marshal.AllocHGlobal(size);
        try
        {
            Marshal.StructureToPtr(limits, buffer, false);
            if (!SetInformationJobObject(job, 9, buffer, (uint)size) || !AssignProcessToJobObject(job, process.Handle))
            { CloseHandle(job); job = IntPtr.Zero; }
        }
        finally { Marshal.FreeHGlobal(buffer); }
    }
}

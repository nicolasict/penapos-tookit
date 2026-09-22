using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.ServiceProcess;
using System.Windows.Forms;

class ControlPanel : Form {
    readonly Label status = new Label();
    readonly Button start = new Button(), stop = new Button(), restart = new Button(), open = new Button();
    readonly Timer timer = new Timer();
    Process operation;
    readonly string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "KTPStudio");
    static readonly string powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe");

    [STAThread] static int Main(string[] args) {
        bool testing=args.Length==2 && args[0]=="--smoke-test";
        string report=testing?args[1]:Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"PENAPRINT-TOOLKIT\panel-error.log");
        try {
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.ThrowException);
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            using(var panel=new ControlPanel()) {
                bool verified=false;
                if(testing)panel.Shown+=(sender,e)=>panel.BeginInvoke(new Action(()=>{
                    panel.RefreshStatus();
                    if(!panel.Visible || !panel.IsHandleCreated || panel.Handle==IntPtr.Zero)
                        throw new InvalidOperationException("Panel Shown fired without a visible window handle.");
                    if(panel.start.Enabled || !panel.stop.Enabled || !panel.restart.Enabled || !panel.open.Enabled)
                        throw new InvalidOperationException("Panel did not detect the running service: "+panel.status.Text);
                    foreach(var button in new Button[]{panel.start,panel.stop,panel.restart,panel.open})
                        if(!button.Visible || !button.IsHandleCreated)
                            throw new InvalidOperationException("Panel button not displayed: "+button.Text);
                    using(var bitmap=new Bitmap(panel.ClientSize.Width,panel.ClientSize.Height)){
                        panel.DrawToBitmap(bitmap,panel.ClientRectangle);
                        bitmap.Save(report+".png",System.Drawing.Imaging.ImageFormat.Png);
                    }
                    File.WriteAllText(report,"PASS: panel Shown, window handle, controls, running service and render verified.");
                    verified=true;
                    panel.Close();
                }));
                Application.Run(panel);
                if(testing && !verified)throw new InvalidOperationException("Panel exited before Shown verification completed.");
            }
            return 0;
        } catch(Exception error) {
            try {
                Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(report)));
                File.WriteAllText(report,error.ToString());
            } catch { }
            if(!testing)MessageBox.Show("Panel gagal dibuka: "+error.Message+"\nLog: "+report,"PENAPRINT - TOOLKIT",MessageBoxButtons.OK,MessageBoxIcon.Error);
            return 1;
        }
    }
    ControlPanel() {
        Text = "PENAPRINT - TOOLKIT";
        ClientSize = new Size(520, 290); MinimumSize = new Size(536, 329);
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 10); BackColor = Color.FromArgb(243,243,243);
        var layout = new FlowLayoutPanel { Dock=DockStyle.Fill, Padding=new Padding(24), FlowDirection=FlowDirection.TopDown, WrapContents=false };
        layout.Controls.Add(new Label {Text="PENAPRINT - TOOLKIT", Font=new Font("Segoe UI",18,FontStyle.Bold), AutoSize=true, Margin=new Padding(0,0,0,18)});
        status.AutoSize=true; status.Margin=new Padding(0,0,0,18); layout.Controls.Add(status);
        var buttons=new FlowLayoutPanel {Width=470, Height=48};
        Configure(start,"Mulai",()=>Manage("Start-Service"));
        Configure(stop,"Hentikan",()=>Manage("Stop-Service"));
        Configure(restart,"Mulai ulang",()=>Manage("Restart-Service"));
        buttons.Controls.AddRange(new Control[]{start,stop,restart}); layout.Controls.Add(buttons);
        Configure(open,"Buka aplikasi",OpenPortal); open.Width=450; layout.Controls.Add(open);
        layout.Controls.Add(new Label {Text="Hentikan / mulai ulang akan menghapus antrean foto di RAM.",AutoSize=true,Margin=new Padding(0,12,0,0), ForeColor=Color.DimGray});
        Controls.Add(layout);
        timer.Interval=1000; timer.Tick+=(s,e)=>RefreshStatus(); timer.Start(); RefreshStatus();
        FormClosed+=(s,e)=>{timer.Stop();timer.Dispose();if(operation!=null)operation.Dispose();};
    }
    void Configure(Button b,string text,Action action) {
        b.Text=text;b.Size=new Size(140,38);b.FlatStyle=FlatStyle.System;
        b.Click+=(s,e)=>{try{action();}catch(Exception error){MessageBox.Show(this,error.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Error);}};
    }
    void RefreshStatus() {
        bool busy=operation!=null;
        if(busy && operation.HasExited){
            int code=operation.ExitCode;operation.Dispose();operation=null;busy=false;
            if(code!=0)MessageBox.Show(this,"Perintah gagal. Periksa service KTPStudio dan folder logs di "+root,Text,MessageBoxButtons.OK,MessageBoxIcon.Error);
        }
        try {
            using(var service=new ServiceController("KTPStudio")) {
                var value=service.Status;
                bool running=value==ServiceControllerStatus.Running, stopped=value==ServiceControllerStatus.Stopped;
                status.Text="Status: "+(busy?"Memproses…":running?"Berjalan":stopped?"Berhenti":"Sedang berubah…");
                start.Enabled=!busy&&stopped;stop.Enabled=restart.Enabled=!busy&&running;open.Enabled=running&&!busy;
            }
        } catch {
            status.Text="Status: service belum terpasang / tidak dapat dibaca";
            start.Enabled=stop.Enabled=restart.Enabled=open.Enabled=false;
        }
    }
    void Manage(string command) {
        if(operation!=null)return;
        if(command!="Start-Service" && MessageBox.Show(this,"Foto yang masih di antrean RAM akan hilang. Lanjutkan?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return;
        try {
            operation=Process.Start(new ProcessStartInfo(powershell,
                "-NoProfile -NonInteractive -Command \"try { "+command+" -Name KTPStudio -ErrorAction Stop; exit 0 } catch { exit 1 }\"") {
                UseShellExecute=true,Verb="runas",WindowStyle=ProcessWindowStyle.Hidden
            });
        } catch(System.ComponentModel.Win32Exception e) {if(e.NativeErrorCode!=1223)throw;}
        RefreshStatus();
    }
    void OpenPortal() {
        // Read only the protected runtime log. The panel itself runs unelevated.
        string log=Path.Combine(root,@"logs\KTPStudio.out.log");
        string text;
        using(var stream=new FileStream(log,FileMode.Open,FileAccess.Read,FileShare.ReadWrite))
        using(var reader=new StreamReader(stream))text=reader.ReadToEnd();
        var matches=System.Text.RegularExpressions.Regex.Matches(text,@"https://[0-9.]+:[0-9]+/#owner=[A-Za-z0-9_-]+");
        if(matches.Count==0)throw new Exception("Server belum siap. Tunggu beberapa detik lalu coba lagi.");
        Process.Start(new ProcessStartInfo(matches[matches.Count-1].Value){UseShellExecute=true});
    }
}

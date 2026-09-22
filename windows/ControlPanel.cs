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

    [STAThread] static void Main() {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new ControlPanel());
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

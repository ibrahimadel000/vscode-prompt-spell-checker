using System;
using System.Runtime.InteropServices;
using System.Threading;

class Program {
    [DllImport("user32.dll")]
    static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    const int KEYEVENTF_KEYUP = 0x0002;
    const byte VK_MENU = 0x12;
    const byte VK_LMENU = 0xA4;
    const byte VK_RMENU = 0xA5;
    const byte VK_CONTROL = 0x11;
    const byte VK_LCONTROL = 0xA2;
    const byte VK_RCONTROL = 0xA3;
    const byte VK_SHIFT = 0x10;
    const byte VK_LSHIFT = 0xA0;
    const byte VK_RSHIFT = 0xA1;
    const byte VK_C = 0x43;
    const byte VK_V = 0x56;
    const byte VK_Q = 0x51;
    const byte VK_W = 0x57;

    [STAThread]
    static void Main(string[] args) {
        bool isPaste = false;
        int delayMs = 30;

        for (int i = 0; i < args.Length; i++) {
            if (args[i] == "--paste") {
                isPaste = true;
            } else if (args[i] == "--delay" && i + 1 < args.Length) {
                int.TryParse(args[i + 1], out delayMs);
            }
        }

        // Release modifier keys and hotkeys so they don't interfere (e.g. Alt+W, Alt+Q)
        keybd_event(VK_LMENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        keybd_event(VK_RMENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        keybd_event(VK_LCONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        keybd_event(VK_RCONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        keybd_event(VK_LSHIFT, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        keybd_event(VK_RSHIFT, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        keybd_event(VK_SHIFT, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        keybd_event(VK_Q, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        keybd_event(VK_W, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        Thread.Sleep(Math.Max(10, delayMs));

        byte targetKey = isPaste ? VK_V : VK_C;

        keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
        Thread.Sleep(15);
        keybd_event(targetKey, 0, 0, UIntPtr.Zero);
        Thread.Sleep(25);
        keybd_event(targetKey, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }
}

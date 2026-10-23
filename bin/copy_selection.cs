using System;
using System.Runtime.InteropServices;
using System.Threading;

class Program {
    [DllImport("user32.dll")]
    static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    static extern short GetAsyncKeyState(int vKey);

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
    const byte VK_A = 0x41;
    const byte VK_HOME = 0x24;
    const byte VK_END = 0x23;

    static bool IsKeyHeld(int vk) {
        return (GetAsyncKeyState(vk) & 0x8000) != 0;
    }

    static void ReleaseKeyIfHeld(byte vk) {
        if (IsKeyHeld(vk)) {
            keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        }
    }

    static void SafeReleaseModifiers() {
        bool altHeld = IsKeyHeld(VK_MENU) || IsKeyHeld(VK_LMENU) || IsKeyHeld(VK_RMENU);
        if (altHeld) {
            // Sending dummy unassigned key (0xFF) before releasing Alt tells Windows
            // that Alt was not a standalone tap, preventing Windows from activating
            // the top menu bar (File/Edit) and stealing keyboard focus from the chat input!
            keybd_event(0xFF, 0, 0, UIntPtr.Zero);
            keybd_event(0xFF, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            keybd_event(VK_LMENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            keybd_event(VK_RMENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        }
        ReleaseKeyIfHeld(VK_LCONTROL);
        ReleaseKeyIfHeld(VK_RCONTROL);
        ReleaseKeyIfHeld(VK_CONTROL);
        ReleaseKeyIfHeld(VK_LSHIFT);
        ReleaseKeyIfHeld(VK_RSHIFT);
        ReleaseKeyIfHeld(VK_SHIFT);
        ReleaseKeyIfHeld(VK_Q);
        ReleaseKeyIfHeld(VK_W);
    }

    [STAThread]
    static void Main(string[] args) {
        bool isPaste = false;
        bool isReplacePaste = false;
        bool isCopyLine = false;
        int delayMs = 30;

        for (int i = 0; i < args.Length; i++) {
            if (args[i] == "--paste") {
                isPaste = true;
            } else if (args[i] == "--replace-paste") {
                isReplacePaste = true;
            } else if (args[i] == "--copy-line") {
                isCopyLine = true;
            } else if (args[i] == "--delay" && i + 1 < args.Length) {
                int.TryParse(args[i + 1], out delayMs);
            }
        }

        // Release modifier keys safely so they don't interfere with Ctrl+C / Ctrl+V / Shift+Home
        SafeReleaseModifiers();
        Thread.Sleep(Math.Max(10, delayMs));

        if (isReplacePaste) {
            // Select all in focused control (Ctrl+A) then paste over (Ctrl+V)
            keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
            Thread.Sleep(15);
            keybd_event(VK_A, 0, 0, UIntPtr.Zero);
            Thread.Sleep(25);
            keybd_event(VK_A, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            Thread.Sleep(15);
            keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            Thread.Sleep(25);

            keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
            Thread.Sleep(15);
            keybd_event(VK_V, 0, 0, UIntPtr.Zero);
            Thread.Sleep(30);
            keybd_event(VK_V, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            Thread.Sleep(15);
            keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        } else if (isPaste) {
            keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
            Thread.Sleep(20);
            keybd_event(VK_V, 0, 0, UIntPtr.Zero);
            Thread.Sleep(30);
            keybd_event(VK_V, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            Thread.Sleep(10);
            keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        } else if (isCopyLine) {
            // First jump to End of line so entire prompt line is captured regardless of cursor position
            keybd_event(VK_END, 0, 0, UIntPtr.Zero);
            Thread.Sleep(15);
            keybd_event(VK_END, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            Thread.Sleep(15);

            // Select line backwards to beginning of line (Shift+Home)
            keybd_event(VK_SHIFT, 0, 0, UIntPtr.Zero);
            Thread.Sleep(15);
            keybd_event(VK_HOME, 0, 0, UIntPtr.Zero);
            Thread.Sleep(25);
            keybd_event(VK_HOME, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            keybd_event(VK_SHIFT, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            Thread.Sleep(25);

            // Copy selected line (Ctrl+C)
            keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
            Thread.Sleep(15);
            keybd_event(VK_C, 0, 0, UIntPtr.Zero);
            Thread.Sleep(25);
            keybd_event(VK_C, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        } else {
            // Regular copy of already-highlighted text (Ctrl+C)
            keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
            Thread.Sleep(15);
            keybd_event(VK_C, 0, 0, UIntPtr.Zero);
            Thread.Sleep(25);
            keybd_event(VK_C, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        }
    }
}

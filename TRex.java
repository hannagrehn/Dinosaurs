public class TRex {

    static final int SCREEN_WIDTH = 80;
    static final int DELAY_MS = 100;
    static final int TREX_WIDTH = 18;

    // Two frames alternated to simulate running legs
    static final String[][] FRAMES = {
        {
            "       __        ",
            "      / _)       ",
            "  .-^^^-/ /      ",
            " (____|_/-       ",
            "   ||  ||        ",
            "  /|  /|         "
        },
        {
            "       __        ",
            "      / _)       ",
            "  .-^^^-/ /      ",
            " (____|_/-       ",
            "   ||  ||        ",
            "   |\\ |\\         "
        }
    };

    // Total lines printed per frame (T-Rex rows + ground)
    static final int FRAME_LINES = FRAMES[0].length + 1;
    static boolean firstDraw = true;

    public static void main(String[] args) throws InterruptedException {
        // Run right
        for (int pos = 0; pos <= SCREEN_WIDTH - TREX_WIDTH; pos++) {
            draw(pos, pos);
            Thread.sleep(DELAY_MS);
        }
        // Run left
        for (int pos = SCREEN_WIDTH - TREX_WIDTH; pos >= 0; pos--) {
            draw(pos, pos);
            Thread.sleep(DELAY_MS);
        }
    }

    static void draw(int offset, int frameIndex) {
        if (!firstDraw) {
            // Move cursor back up to overwrite previous frame
            System.out.print("\033[" + FRAME_LINES + "A");
        }
        firstDraw = false;

        String pad = " ".repeat(Math.max(0, offset));
        String[] lines = FRAMES[frameIndex % 2];

        for (String line : lines) {
            // Pad each line to full width to erase leftover characters
            String full = pad + line;
            System.out.println(full + " ".repeat(Math.max(0, SCREEN_WIDTH - full.length())));
        }
        System.out.println("~".repeat(SCREEN_WIDTH));
        System.out.flush();
    }
}

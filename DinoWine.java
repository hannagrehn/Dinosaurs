import javax.swing.*;
import java.awt.*;
import java.awt.event.*;
import java.io.*;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

public class DinoWine extends JPanel implements ActionListener {

    // --- Constants ---
    static final int WIDTH    = 800;
    static final int HEIGHT   = 520;
    static final int GROUND_Y = 390;
    static final int DINO_X   = 110;

    static final Font MONO_LG = new Font("Monospaced", Font.BOLD, 18);
    static final Font MONO_SM = new Font("Monospaced", Font.PLAIN, 13);

    static final Color BG         = Color.BLACK;
    static final Color FG         = new Color(0, 220, 0);
    static final Color WINE_COLOR = new Color(210, 30, 80);
    static final Color WARN_COLOR = new Color(255, 165, 0);
    static final Color DANGER     = Color.RED;
    static final Color GROUND_COLOR = new Color(0, 120, 0);

    static final String SAVE_FILE = "highscore.txt";

    static final int START = 0, PLAYING = 1, GAME_OVER = 2;

    // --- Game state ---
    int    state      = START;
    int    score      = 0;
    int    lives      = 3;
    int    highScore  = 0;
    int    animFrame  = 0;
    double difficulty = 1.0;

    // Balance
    double balance  = 0.0;
    double velocity = 0.0;
    boolean leftDown  = false;
    boolean rightDown = false;

    // Jump
    double  dinoY     = GROUND_Y;
    double  jumpVel   = 0;
    boolean isJumping = false;

    // Obstacles (x positions)
    List<Integer> obstacles    = new ArrayList<>();
    int           obstacleTimer = 0;

    // Wind gust
    int gustCooldown = 100;

    // Flash messages
    String flashMsg   = "";
    int    flashTimer = 0;

    Timer gameTimer;

    // --- Constructor ---
    public DinoWine() {
        setPreferredSize(new Dimension(WIDTH, HEIGHT));
        setBackground(BG);
        setFocusable(true);
        highScore = loadHighScore();

        addKeyListener(new KeyAdapter() {
            public void keyPressed(KeyEvent e) {
                int k = e.getKeyCode();
                if (k == KeyEvent.VK_LEFT)  leftDown  = true;
                if (k == KeyEvent.VK_RIGHT) rightDown = true;
                if (k == KeyEvent.VK_SPACE) {
                    if (state == PLAYING && !isJumping) doJump();
                    else if (state != PLAYING)          startGame();
                }
            }
            public void keyReleased(KeyEvent e) {
                int k = e.getKeyCode();
                if (k == KeyEvent.VK_LEFT)  leftDown  = false;
                if (k == KeyEvent.VK_RIGHT) rightDown = false;
            }
        });

        gameTimer = new Timer(40, this); // ~25 FPS
        gameTimer.start();
    }

    // --- Game control ---
    void startGame() {
        score = 0; lives = 3; difficulty = 1.0; animFrame = 0;
        balance = 0; velocity = 0;
        dinoY = GROUND_Y; jumpVel = 0; isJumping = false;
        obstacles.clear(); obstacleTimer = 60;
        gustCooldown = 120; flashMsg = "";
        state = PLAYING;
    }

    void doJump() {
        isJumping = true;
        jumpVel   = -17;
        velocity += (Math.random() - 0.5) * 0.12; // jumping sloshes the wine!
        flash("JUMP!");
    }

    void loseLife(String reason) {
        lives--;
        balance  = 0;
        velocity = 0;
        flash(reason);
        if (lives <= 0) {
            state = GAME_OVER;
            saveHighScore(highScore);
        }
    }

    void flash(String msg) {
        flashMsg   = msg;
        flashTimer = 30;
    }

    // --- Game loop ---
    public void actionPerformed(ActionEvent e) {
        if (state == PLAYING) update();
        repaint();
    }

    void update() {
        score++;
        animFrame++;
        difficulty = 1.0 + score / 380.0;

        // Jump physics
        if (isJumping) {
            dinoY   += jumpVel;
            jumpVel += 1.3; // gravity
            if (dinoY >= GROUND_Y) {
                dinoY     = GROUND_Y;
                isJumping = false;
                velocity += (Math.random() - 0.5) * 0.10; // landing slosh
            }
        }

        // Balance physics
        double drift = (Math.random() - 0.495) * 0.013 * difficulty;
        velocity += drift;
        if (leftDown)  velocity -= 0.027;
        if (rightDown) velocity += 0.027;
        velocity *= 0.93;
        balance  += velocity;

        if (balance <= -1.0 || balance >= 1.0) {
            loseLife("SPILLED! Wine everywhere!");
        }

        // Spawn obstacles
        obstacleTimer--;
        if (obstacleTimer <= 0) {
            obstacles.add(WIDTH + 10);
            int gap = (int) Math.max(70, 210 - difficulty * 18);
            obstacleTimer = gap + (int)(Math.random() * 70);
        }

        // Move obstacles + collision detection
        int speed = (int)(5 + difficulty * 1.3);
        Iterator<Integer> it = obstacles.iterator();
        List<Integer> toKeep = new ArrayList<>();
        while (it.hasNext()) {
            int ox = it.next() - speed;
            if (ox < -60) continue; // off-screen, discard

            // Collision: dino body spans DINO_X to DINO_X+110, on ground = dinoY >= GROUND_Y - 5
            boolean hit = (ox < DINO_X + 110 && ox + 40 > DINO_X) && !isJumping;
            if (hit) {
                velocity += (Math.random() > 0.5 ? 0.4 : -0.4); // jolt the glass
                loseLife("OUCH! Cactus hit!");
                // don't keep this obstacle
            } else {
                toKeep.add(ox);
            }
        }
        obstacles = toKeep;

        // Wind gusts
        gustCooldown--;
        if (gustCooldown <= 0) {
            double strength = (0.08 + Math.random() * 0.18) * Math.min(difficulty, 2.5);
            boolean leftGust = Math.random() < 0.5;
            velocity += leftGust ? -strength : strength;
            flash(leftGust ? "<< WIND GUST! <<" : ">> WIND GUST! >>");
            gustCooldown = (int) Math.max(50, 160 - difficulty * 15) + (int)(Math.random() * 60);
        }

        // Flash timer
        if (flashTimer > 0) flashTimer--;

        // High score
        int currentScore = score / 20;
        if (currentScore > highScore) {
            highScore = currentScore;
        }
    }

    // --- Drawing ---
    protected void paintComponent(Graphics g) {
        super.paintComponent(g);
        Graphics2D g2 = (Graphics2D) g;
        g2.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);

        if      (state == START)     drawStart(g2);
        else if (state == PLAYING)   drawGame(g2);
        else if (state == GAME_OVER) drawGameOver(g2);
    }

    void drawStart(Graphics2D g2) {
        g2.setFont(MONO_LG);
        g2.setColor(WINE_COLOR);
        drawCentered(g2, "* DINO WINE BALANCE *", HEIGHT/2 - 120);
        g2.setColor(FG);
        drawCentered(g2, "Keep the wine glass from spilling!", HEIGHT/2 - 60);
        g2.setColor(Color.YELLOW);
        drawCentered(g2, "SPACE       = jump over cacti", HEIGHT/2 - 10);
        drawCentered(g2, "<-- -->     = balance the wine", HEIGHT/2 + 25);
        g2.setColor(WARN_COLOR);
        drawCentered(g2, "Watch out for wind gusts!", HEIGHT/2 + 65);
        g2.setFont(MONO_SM);
        g2.setColor(Color.GRAY);
        drawCentered(g2, "High Score: " + highScore, HEIGHT/2 + 100);
        g2.setFont(MONO_LG);
        g2.setColor(Color.WHITE);
        drawCentered(g2, "[ SPACE to start ]", HEIGHT/2 + 145);
    }

    void drawGameOver(Graphics2D g2) {
        g2.setFont(MONO_LG);
        g2.setColor(DANGER);
        drawCentered(g2, "GAME OVER!", HEIGHT/2 - 90);
        g2.setColor(FG);
        drawCentered(g2, "Score:        " + (score / 20), HEIGHT/2 - 25);
        drawCentered(g2, "High Score:   " + highScore, HEIGHT/2 + 15);
        drawCentered(g2, "Level reached: " + String.format("%.1f", difficulty), HEIGHT/2 + 55);
        g2.setColor(Color.YELLOW);
        drawCentered(g2, "[ SPACE to try again ]", HEIGHT/2 + 110);
    }

    void drawGame(Graphics2D g2) {
        // HUD top-left
        g2.setFont(MONO_LG);
        g2.setColor(FG);
        g2.drawString("Score: " + (score / 20), 15, 30);
        g2.drawString("Lv: " + String.format("%.1f", difficulty), 15, 55);

        // High score top-center-right
        g2.setFont(MONO_SM);
        g2.setColor(Color.GRAY);
        g2.drawString("Best: " + highScore, WIDTH - 110, 55);

        // Lives top-right
        g2.setFont(MONO_LG);
        g2.setColor(WINE_COLOR);
        StringBuilder sb = new StringBuilder("Lives: ");
        for (int i = 0; i < lives; i++) sb.append("Y ");
        g2.drawString(sb.toString().trim(), WIDTH - 200, 30);

        // Balance bar
        drawBalanceBar(g2);

        // Ground line
        g2.setColor(GROUND_COLOR);
        g2.fillRect(0, GROUND_Y + 12, WIDTH, 3);

        // Cacti
        for (int ox : obstacles) drawCactus(g2, ox);

        // Dino + wine glass
        drawDino(g2);

        // Flash message (fades out)
        if (flashTimer > 0) {
            float alpha = Math.min(1f, (float) flashTimer / 20f);
            g2.setFont(MONO_LG);
            g2.setColor(new Color(1f, 0.85f, 0f, alpha));
            drawCentered(g2, flashMsg, HEIGHT / 2 - 20);
        }

        // Controls hint
        g2.setFont(MONO_SM);
        g2.setColor(new Color(55, 55, 55));
        drawCentered(g2, "SPACE = jump over cacti   |   <-- --> = balance the wine", HEIGHT - 12);
    }

    void drawBalanceBar(Graphics2D g2) {
        int barW = 320, barH = 18;
        int barX = (WIDTH - barW) / 2, barY = 12;

        g2.setColor(new Color(30, 30, 30));
        g2.fillRect(barX, barY, barW, barH);

        double abs  = Math.abs(balance);
        Color  fill = abs < 0.5 ? FG : abs < 0.75 ? WARN_COLOR : DANGER;
        int fillW = (int)(abs * (barW / 2.0));
        int fillX = balance < 0 ? barX + barW/2 - fillW : barX + barW/2;

        g2.setColor(fill);
        g2.fillRect(fillX, barY, fillW, barH);

        g2.setColor(Color.WHITE);
        g2.fillRect(barX + barW/2 - 1, barY, 2, barH);
        g2.setColor(Color.GRAY);
        g2.drawRect(barX, barY, barW, barH);

        g2.setFont(MONO_SM);
        g2.setColor(FG);
        drawCentered(g2, "~ wine balance ~", barY + barH + 15);
    }

    void drawCactus(Graphics2D g2, int ox) {
        g2.setFont(MONO_LG);
        g2.setColor(FG);
        String[] cactus = { " _|_ ", "/ | \\", "  |  ", "  |  " };
        int y = GROUND_Y - cactus.length * 19 + 19;
        for (String line : cactus) {
            g2.drawString(line, ox, y);
            y += 19;
        }
    }

    void drawDino(Graphics2D g2) {
        g2.setFont(MONO_LG);
        int glassShiftX = (int)(balance * 26);
        boolean danger   = Math.abs(balance) > 0.72;
        boolean spilling = Math.abs(balance) > 0.87;

        String[] glass = getWineGlass(spilling);
        String[] dino  = getDinoFrame();

        int totalDinoH = dino.length  * 20;
        int totalGlassH = glass.length * 20;
        int dinoTopY  = (int) dinoY - totalDinoH + 20;
        int glassTopY = dinoTopY - totalGlassH;

        // Wine glass
        g2.setColor(spilling ? DANGER : danger ? WARN_COLOR : WINE_COLOR);
        int gy = glassTopY;
        for (String line : glass) {
            g2.drawString(line, DINO_X + 14 + glassShiftX, gy);
            gy += 20;
        }

        // Dino
        g2.setColor(FG);
        int dy = dinoTopY;
        for (String line : dino) {
            g2.drawString(line, DINO_X, dy);
            dy += 20;
        }
    }

    String[] getWineGlass(boolean spilling) {
        double b = balance;
        if (spilling && b < 0) return new String[]{ "~~~      ", " .-----. ", " |     | ", "  \\---/  ", "   ||    ", "  _||_   " };
        if (spilling && b > 0) return new String[]{ "      ~~~", " .-----. ", " |     | ", "  \\---/  ", "   ||    ", "  _||_   " };
        if (b < -0.35)         return new String[]{ " .-----. ", " |~~~  | ", "  \\---/  ", "   ||    ", "  _||_   " };
        if (b >  0.35)         return new String[]{ " .-----. ", " |  ~~~| ", "  \\---/  ", "   ||    ", "  _||_   " };
        return new String[]{                        " .-----. ", " |~~~~~| ", "  \\---/  ", "   ||    ", "  _||_   " };
    }

    String[] getDinoFrame() {
        if (animFrame % 2 == 0)
            return new String[]{ "  _|_|_   ", " [=====]  ", "(  o     >", " \\______/ ", "  ||   || ", " /  \\ /  \\" };
        else
            return new String[]{ "  _|_|_   ", " [=====]  ", "(  o     >", " \\______/ ", "  ||   || ", "  /\\   /\\ " };
    }

    void drawCentered(Graphics2D g2, String text, int y) {
        FontMetrics fm = g2.getFontMetrics();
        g2.drawString(text, (WIDTH - fm.stringWidth(text)) / 2, y);
    }

    // --- High score persistence ---
    int loadHighScore() {
        try (BufferedReader br = new BufferedReader(new FileReader(SAVE_FILE))) {
            return Integer.parseInt(br.readLine().trim());
        } catch (Exception e) { return 0; }
    }

    void saveHighScore(int hs) {
        try (PrintWriter pw = new PrintWriter(new FileWriter(SAVE_FILE))) {
            pw.println(hs);
        } catch (Exception ignored) {}
    }

    // --- Entry point ---
    public static void main(String[] args) {
        JFrame frame = new JFrame("Dino Wine Balance");
        DinoWine game = new DinoWine();
        frame.add(game);
        frame.pack();
        frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        frame.setLocationRelativeTo(null);
        frame.setVisible(true);
        game.requestFocusInWindow();
    }
}

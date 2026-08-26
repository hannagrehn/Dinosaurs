import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.Executors;

public class DinoHat {
    private static final int PORT = 8080;
    private static final int MAX_CLUES_PER_TARGET = 10;
    private static final int CLUE_ENTRY_SECONDS = 30;
    private static final int GUESS_SECONDS = 10;
    private static final ConcurrentMap<String, Room> ROOMS = new ConcurrentHashMap<String, Room>();

    public static void main(String[] args) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(PORT), 0);
        server.createContext("/", safe(exchange -> serveStatic(exchange, "index.html", "text/html; charset=utf-8")));
        server.createContext("/app.js", safe(exchange -> serveStatic(exchange, "app.js", "application/javascript; charset=utf-8")));
        server.createContext("/styles.css", safe(exchange -> serveStatic(exchange, "styles.css", "text/css; charset=utf-8")));
        server.createContext("/api/create-room", safe(DinoHat::handleCreateRoom));
        server.createContext("/api/join-room", safe(DinoHat::handleJoinRoom));
        server.createContext("/api/submit-clue", safe(DinoHat::handleSubmitClue));
        server.createContext("/api/start-game", safe(DinoHat::handleStartGame));
        server.createContext("/api/draw", safe(DinoHat::handleDraw));
        server.createContext("/api/guess", safe(DinoHat::handleGuess));
        server.createContext("/api/kick-player", safe(DinoHat::handleKickPlayer));
        server.createContext("/api/state", safe(DinoHat::handleState));
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();
        System.out.println("DinoHat is running at http://localhost:" + PORT);
    }

    private static HttpHandler safe(ExchangeHandler handler) {
        return exchange -> {
            try {
                handler.handle(exchange);
            } catch (DinoHatException exception) {
                writeError(exchange, exception.statusCode, exception.getMessage());
            } catch (Exception exception) {
                writeError(exchange, 500, "Unexpected server error.");
            }
        };
    }

    private static void handleCreateRoom(HttpExchange exchange) throws IOException {
        ensureMethod(exchange, "POST");
        Map<String, String> form = readForm(exchange);
        String playerName = requireValue(form, "playerName");
        String roomCode = generateRoomCode();
        Room room = new Room(roomCode, playerName);
        ROOMS.put(roomCode, room);
        writeJson(exchange, 200, "{"
                + "\"roomCode\":\"" + escapeJson(roomCode) + "\","
                + "\"playerId\":\"" + escapeJson(room.hostPlayerId) + "\""
                + "}");
    }

    private static void handleJoinRoom(HttpExchange exchange) throws IOException {
        ensureMethod(exchange, "POST");
        Map<String, String> form = readForm(exchange);
        String roomCode = requireValue(form, "roomCode").toUpperCase(Locale.ROOT);
        String playerName = requireValue(form, "playerName");
        Room room = requireRoom(roomCode);
        Player player = room.addPlayer(playerName);
        writeJson(exchange, 200, "{"
                + "\"roomCode\":\"" + escapeJson(roomCode) + "\","
                + "\"playerId\":\"" + escapeJson(player.id) + "\""
                + "}");
    }

    private static void handleSubmitClue(HttpExchange exchange) throws IOException {
        ensureMethod(exchange, "POST");
        Map<String, String> form = readForm(exchange);
        Room room = requireRoom(requireValue(form, "roomCode").toUpperCase(Locale.ROOT));
        room.submitClue(requireValue(form, "playerId"), requireValue(form, "clueText"), requireValue(form, "targetPlayerId"));
        writeJson(exchange, 200, "{\"ok\":true}");
    }

    private static void handleStartGame(HttpExchange exchange) throws IOException {
        ensureMethod(exchange, "POST");
        Map<String, String> form = readForm(exchange);
        Room room = requireRoom(requireValue(form, "roomCode").toUpperCase(Locale.ROOT));
        room.startGame(requireValue(form, "playerId"));
        writeJson(exchange, 200, "{\"ok\":true}");
    }

    private static void handleDraw(HttpExchange exchange) {
        ensureMethod(exchange, "POST");
        throw new DinoHatException("Clues are now revealed automatically during timed turns.", 409);
    }

    private static void handleGuess(HttpExchange exchange) throws IOException {
        ensureMethod(exchange, "POST");
        Map<String, String> form = readForm(exchange);
        Room room = requireRoom(requireValue(form, "roomCode").toUpperCase(Locale.ROOT));
        GuessResult result = room.guess(requireValue(form, "playerId"), requireValue(form, "guessedPlayerId"));
        writeJson(exchange, 200, "{"
                + "\"ok\":true,"
                + "\"correct\":" + result.correct
                + "}");
    }

    private static void handleKickPlayer(HttpExchange exchange) throws IOException {
        ensureMethod(exchange, "POST");
        Map<String, String> form = readForm(exchange);
        Room room = requireRoom(requireValue(form, "roomCode").toUpperCase(Locale.ROOT));
        room.kickPlayer(requireValue(form, "playerId"), requireValue(form, "targetPlayerId"));
        writeJson(exchange, 200, "{\"ok\":true}");
    }

    private static void handleState(HttpExchange exchange) throws IOException {
        ensureMethod(exchange, "GET");
        Map<String, String> query = parseForm(exchange.getRequestURI().getRawQuery());
        Room room = requireRoom(requireValue(query, "roomCode").toUpperCase(Locale.ROOT));
        writeJson(exchange, 200, room.toStateJson(requireValue(query, "playerId")));
    }

    private static void ensureMethod(HttpExchange exchange, String expectedMethod) {
        if (!expectedMethod.equalsIgnoreCase(exchange.getRequestMethod())) {
            throw new DinoHatException("Use " + expectedMethod + " for this endpoint.", 405);
        }
    }

    private static void serveStatic(HttpExchange exchange, String fileName, String contentType) throws IOException {
        ensureMethod(exchange, "GET");
        Path path = Path.of(fileName);
        if (!Files.exists(path)) {
            throw new DinoHatException("Missing asset: " + fileName, 404);
        }

        byte[] bytes = Files.readAllBytes(path);
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.sendResponseHeaders(200, bytes.length);
        try (OutputStream outputStream = exchange.getResponseBody()) {
            outputStream.write(bytes);
        }
    }

    private static Map<String, String> readForm(HttpExchange exchange) throws IOException {
        try (InputStream inputStream = exchange.getRequestBody()) {
            String body = new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
            return parseForm(body);
        }
    }

    private static Map<String, String> parseForm(String body) {
        Map<String, String> values = new LinkedHashMap<String, String>();
        if (body == null || body.isEmpty()) {
            return values;
        }

        String[] pairs = body.split("&");
        for (String pair : pairs) {
            if (pair.isEmpty()) {
                continue;
            }
            String[] split = pair.split("=", 2);
            String key = decode(split[0]);
            String value = split.length > 1 ? decode(split[1]) : "";
            values.put(key, value);
        }
        return values;
    }

    private static String decode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }

    private static String requireValue(Map<String, String> values, String key) {
        String value = values.get(key);
        if (value == null || value.trim().isEmpty()) {
            throw new DinoHatException("Missing required value: " + key, 400);
        }
        return value.trim();
    }

    private static Room requireRoom(String roomCode) {
        Room room = ROOMS.get(roomCode);
        if (room == null) {
            throw new DinoHatException("Room not found.", 404);
        }
        return room;
    }

    private static String generateRoomCode() {
        String alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        while (true) {
            StringBuilder code = new StringBuilder();
            for (int i = 0; i < 5; i++) {
                int index = (int) (Math.random() * alphabet.length());
                code.append(alphabet.charAt(index));
            }
            String roomCode = code.toString();
            if (!ROOMS.containsKey(roomCode)) {
                return roomCode;
            }
        }
    }

    private static void writeJson(HttpExchange exchange, int statusCode, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (OutputStream outputStream = exchange.getResponseBody()) {
            outputStream.write(bytes);
        }
    }

    private static void writeError(HttpExchange exchange, int statusCode, String message) throws IOException {
        String json = "{\"error\":\"" + escapeJson(message) + "\"}";
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (OutputStream outputStream = exchange.getResponseBody()) {
            outputStream.write(bytes);
        }
    }

    private static String escapeJson(String value) {
        StringBuilder escaped = new StringBuilder();
        for (int i = 0; i < value.length(); i++) {
            char current = value.charAt(i);
            switch (current) {
                case '\\':
                    escaped.append("\\\\");
                    break;
                case '"':
                    escaped.append("\\\"");
                    break;
                case '\n':
                    escaped.append("\\n");
                    break;
                case '\r':
                    escaped.append("\\r");
                    break;
                case '\t':
                    escaped.append("\\t");
                    break;
                default:
                    if (current < 32) {
                        escaped.append(String.format("\\u%04x", (int) current));
                    } else {
                        escaped.append(current);
                    }
            }
        }
        return escaped.toString();
    }

    private static final class Room {
        private final String code;
        private final LinkedHashMap<String, Player> players = new LinkedHashMap<String, Player>();
        private final List<Clue> clues = new ArrayList<Clue>();
        private final String hostPlayerId;
        private Phase phase = Phase.LOBBY;
        private int activePlayerIndex = 0;
        private String activeClueId;
        private int attemptsOnActiveClue = 0;
        private long turnDeadlineEpochMillis = 0L;
        private String lastResult = "Waiting for players to join.";

        private Room(String code, String hostName) {
            this.code = code;
            Player host = new Player(hostName);
            players.put(host.id, host);
            hostPlayerId = host.id;
        }

        private synchronized Player addPlayer(String name) {
            syncPhase();
            if (phase != Phase.LOBBY) {
                throw new DinoHatException("You can only join before the timed game starts.", 409);
            }
            ensureUniqueName(name);
            Player player = new Player(name);
            players.put(player.id, player);
            lastResult = player.name + " joined the room.";
            return player;
        }

        private synchronized void submitClue(String playerId, String text, String targetPlayerId) {
            syncPhase();
            if (phase != Phase.CLUE_ENTRY) {
                throw new DinoHatException("It is not clue-entry time right now.", 409);
            }

            Player submitter = requirePlayer(playerId);
            Player target = requirePlayer(targetPlayerId);
            if (text.length() < 4) {
                throw new DinoHatException("Make the clue a bit more specific.", 400);
            }

            int clueCount = countCluesForTarget(target.id);
            if (clueCount >= MAX_CLUES_PER_TARGET) {
                throw new DinoHatException(target.name + " already has the max of " + MAX_CLUES_PER_TARGET + " clues.", 409);
            }

            clues.add(new Clue(text, target.id, submitter.id));
            lastResult = submitter.name + " added a clue for " + target.name + " (" + (clueCount + 1) + "/" + MAX_CLUES_PER_TARGET + ").";
        }

        private synchronized void startGame(String playerId) {
            syncPhase();
            Player host = requirePlayer(playerId);
            if (!Objects.equals(host.id, hostPlayerId)) {
                throw new DinoHatException("Only the host can start the game.", 403);
            }
            if (phase != Phase.LOBBY) {
                throw new DinoHatException("The timed game has already started.", 409);
            }
            if (players.size() < 2) {
                throw new DinoHatException("You need at least two players.", 400);
            }

            phase = Phase.CLUE_ENTRY;
            activePlayerIndex = 0;
            activeClueId = null;
            attemptsOnActiveClue = 0;
            startCountdown(CLUE_ENTRY_SECONDS, host.name + " started a shared 30-second clue window. Everyone can write now.");
        }

        private synchronized GuessResult guess(String playerId, String guessedPlayerId) {
            syncPhase();
            if (phase != Phase.GUESSING) {
                throw new DinoHatException("It is not guess time right now.", 409);
            }

            Player guesser = requirePlayer(playerId);
            Player activeGuesser = currentTurnPlayer();
            if (!Objects.equals(guesser.id, activeGuesser.id)) {
                throw new DinoHatException("It is " + activeGuesser.name + "'s 10-second guess turn.", 403);
            }

            Player guessed = requirePlayer(guessedPlayerId);
            Clue clue = requireActiveClue();
            Player target = requirePlayer(clue.targetPlayerId);
            boolean correct = Objects.equals(target.id, guessed.id);

            if (correct) {
                guesser.score += 1;
                clue.used = true;
                activeClueId = null;
                attemptsOnActiveClue = 0;
                moveToNextPlayer();
                startGuessRound(guesser.name + " guessed correctly. \"" + clue.text + "\" belongs to " + target.name + ".");
                return new GuessResult(true);
            }

            handleFailedGuess(guesser.name + " guessed " + guessed.name + ". Nope.");
            return new GuessResult(false);
        }

        private synchronized void kickPlayer(String actorId, String targetPlayerId) {
            syncPhase();
            Player actor = requirePlayer(actorId);
            if (!Objects.equals(actor.id, hostPlayerId)) {
                throw new DinoHatException("Only the host can kick players.", 403);
            }
            if (Objects.equals(actorId, targetPlayerId)) {
                throw new DinoHatException("The host cannot kick themselves.", 400);
            }

            List<Player> orderedPlayers = orderedPlayers();
            int removedIndex = indexOfPlayer(targetPlayerId, orderedPlayers);
            if (removedIndex < 0) {
                throw new DinoHatException("Player not found in this room.", 404);
            }

            Player target = orderedPlayers.get(removedIndex);
            boolean removedActiveClue = removeTargetedClues(target.id);
            players.remove(target.id);

            if (players.size() < 2 && phase != Phase.LOBBY) {
                phase = Phase.FINISHED;
                activeClueId = null;
                turnDeadlineEpochMillis = 0L;
                lastResult = target.name + " was kicked by " + actor.name + ". Not enough players remain. Game over.";
                return;
            }

            if (players.isEmpty()) {
                lastResult = target.name + " was kicked by " + actor.name + ".";
                return;
            }

            adjustActivePlayerIndexAfterRemoval(removedIndex);

            if (phase == Phase.CLUE_ENTRY) {
                startCountdown(CLUE_ENTRY_SECONDS, target.name + " was kicked by " + actor.name + ". Everyone still has shared clue-entry access.");
                return;
            }

            if (phase == Phase.GUESSING) {
                if (removedActiveClue) {
                    attemptsOnActiveClue = 0;
                    startGuessRound(target.name + " was kicked by " + actor.name + ". Their clue was removed.");
                    return;
                }
                attemptsOnActiveClue = Math.min(attemptsOnActiveClue, players.size() - 1);
                startCountdown(GUESS_SECONDS, target.name + " was kicked by " + actor.name + ". " + currentTurnPlayer().name + " now has 10 seconds to guess.");
                return;
            }

            lastResult = target.name + " was kicked by " + actor.name + ".";
        }

        private synchronized String toStateJson(String viewerId) {
            syncPhase();
            Player viewer = requirePlayer(viewerId);
            Player activePlayer = (phase == Phase.GUESSING && !players.isEmpty()) ? currentTurnPlayer() : null;
            Clue activeClue = activeClueId == null ? null : requireActiveClue();
            boolean isHost = Objects.equals(viewer.id, hostPlayerId);

            StringBuilder json = new StringBuilder();
            json.append("{");
            json.append("\"roomCode\":\"").append(escapeJson(code)).append("\",");
            json.append("\"phase\":\"").append(phase.name()).append("\",");
            json.append("\"hostPlayerId\":\"").append(escapeJson(hostPlayerId)).append("\",");
            json.append("\"selfId\":\"").append(escapeJson(viewer.id)).append("\",");
            json.append("\"isHost\":").append(isHost).append(",");
            json.append("\"currentTurnPlayerId\":\"").append(escapeJson(activePlayer == null ? "" : activePlayer.id)).append("\",");
            json.append("\"currentTurnPlayerName\":\"").append(escapeJson(activePlayer == null ? "" : activePlayer.name)).append("\",");
            json.append("\"isMyTurn\":").append(activePlayer != null && Objects.equals(activePlayer.id, viewer.id)).append(",");
            json.append("\"canStart\":").append(phase == Phase.LOBBY && isHost).append(",");
            json.append("\"canSubmitClues\":").append(phase == Phase.CLUE_ENTRY).append(",");
            json.append("\"canGuess\":").append(phase == Phase.GUESSING && activePlayer != null && Objects.equals(activePlayer.id, viewer.id)).append(",");
            json.append("\"turnSecondsLeft\":").append(turnSecondsLeft()).append(",");
            json.append("\"activeClueText\":\"").append(escapeJson(activeClue == null ? "" : activeClue.text)).append("\",");
            json.append("\"lastResult\":\"").append(escapeJson(lastResult)).append("\",");
            json.append("\"finishedSummary\":\"").append(escapeJson(buildWinnerSummary())).append("\",");
            json.append("\"maxCluesPerPlayer\":").append(MAX_CLUES_PER_TARGET).append(",");
            json.append("\"players\":[");

            boolean first = true;
            for (Player player : players.values()) {
                if (!first) {
                    json.append(",");
                }
                first = false;
                int clueCount = countCluesForTarget(player.id);
                json.append("{");
                json.append("\"id\":\"").append(escapeJson(player.id)).append("\",");
                json.append("\"name\":\"").append(escapeJson(player.name)).append("\",");
                json.append("\"score\":").append(player.score).append(",");
                json.append("\"isHost\":").append(Objects.equals(player.id, hostPlayerId)).append(",");
                json.append("\"isCurrentTurn\":").append(activePlayer != null && Objects.equals(player.id, activePlayer.id)).append(",");
                json.append("\"canBeKicked\":").append(isHost && !Objects.equals(player.id, hostPlayerId)).append(",");
                json.append("\"clueCount\":").append(clueCount).append(",");
                json.append("\"clueSlotsLeft\":").append(MAX_CLUES_PER_TARGET - clueCount);
                json.append("}");
            }
            json.append("]");
            json.append("}");
            return json.toString();
        }

        private void syncPhase() {
            if ((phase != Phase.CLUE_ENTRY && phase != Phase.GUESSING) || turnSecondsLeft() > 0) {
                return;
            }

            if (phase == Phase.CLUE_ENTRY) {
                handleSharedClueEntryTimeout();
                return;
            }

            handleFailedGuess(currentTurnPlayer().name + " ran out of time.");
        }

        private void handleSharedClueEntryTimeout() {
            if (!hasUnusedClues()) {
                phase = Phase.LOBBY;
                turnDeadlineEpochMillis = 0L;
                lastResult = "The 30-second clue window ended with nothing in the hat, so the game did not start.";
                return;
            }
            phase = Phase.GUESSING;
            attemptsOnActiveClue = 0;
            startGuessRound("The shared 30-second clue window ended.");
        }

        private void handleFailedGuess(String reason) {
            attemptsOnActiveClue += 1;
            moveToNextPlayer();

            if (attemptsOnActiveClue >= players.size()) {
                Clue clue = requireActiveClue();
                clue.used = true;
                activeClueId = null;
                attemptsOnActiveClue = 0;
                startGuessRound(reason + " Everybody missed that clue.");
                return;
            }

            startCountdown(GUESS_SECONDS, reason + " " + currentTurnPlayer().name + " now has 10 seconds to guess.");
        }

        private void startGuessRound(String prefix) {
            Clue nextClue = nextAvailableClue();
            if (nextClue == null) {
                phase = Phase.FINISHED;
                activeClueId = null;
                turnDeadlineEpochMillis = 0L;
                lastResult = appendSentence(prefix, "The hat is empty. Game over.");
                return;
            }

            phase = Phase.GUESSING;
            activeClueId = nextClue.id;
            attemptsOnActiveClue = 0;
            startCountdown(GUESS_SECONDS, appendSentence(prefix, currentTurnPlayer().name + " has 10 seconds to guess this clue."));
        }

        private void startCountdown(int seconds, String message) {
            turnDeadlineEpochMillis = System.currentTimeMillis() + (seconds * 1000L);
            lastResult = message;
        }

        private int turnSecondsLeft() {
            if ((phase != Phase.CLUE_ENTRY && phase != Phase.GUESSING) || turnDeadlineEpochMillis <= 0L) {
                return 0;
            }
            long remainingMillis = turnDeadlineEpochMillis - System.currentTimeMillis();
            if (remainingMillis <= 0L) {
                return 0;
            }
            return (int) Math.ceil(remainingMillis / 1000.0);
        }

        private boolean hasUnusedClues() {
            return nextAvailableClue() != null;
        }

        private Player currentTurnPlayer() {
            List<Player> orderedPlayers = orderedPlayers();
            if (orderedPlayers.isEmpty()) {
                throw new DinoHatException("No players remain in this room.", 409);
            }
            activePlayerIndex = normalizeIndex(activePlayerIndex, orderedPlayers.size());
            return orderedPlayers.get(activePlayerIndex);
        }

        private List<Player> orderedPlayers() {
            return new ArrayList<Player>(players.values());
        }

        private void moveToNextPlayer() {
            if (players.isEmpty()) {
                activePlayerIndex = 0;
                return;
            }
            activePlayerIndex = normalizeIndex(activePlayerIndex + 1, players.size());
        }

        private int normalizeIndex(int index, int size) {
            if (size == 0) {
                return 0;
            }
            int normalized = index % size;
            if (normalized < 0) {
                normalized += size;
            }
            return normalized;
        }

        private int indexOfPlayer(String playerId, List<Player> orderedPlayers) {
            for (int i = 0; i < orderedPlayers.size(); i++) {
                if (Objects.equals(orderedPlayers.get(i).id, playerId)) {
                    return i;
                }
            }
            return -1;
        }

        private void adjustActivePlayerIndexAfterRemoval(int removedIndex) {
            if (players.isEmpty()) {
                activePlayerIndex = 0;
                return;
            }
            if (removedIndex < activePlayerIndex || activePlayerIndex >= players.size()) {
                activePlayerIndex -= 1;
            }
            activePlayerIndex = normalizeIndex(activePlayerIndex, players.size());
        }

        private String appendSentence(String firstSentence, String secondSentence) {
            if (firstSentence == null || firstSentence.trim().isEmpty()) {
                return secondSentence;
            }
            return firstSentence + " " + secondSentence;
        }

        private String buildWinnerSummary() {
            if (phase != Phase.FINISHED || players.isEmpty()) {
                return "";
            }

            int bestScore = Integer.MIN_VALUE;
            List<String> winners = new ArrayList<String>();
            for (Player player : players.values()) {
                if (player.score > bestScore) {
                    winners.clear();
                    winners.add(player.name);
                    bestScore = player.score;
                } else if (player.score == bestScore) {
                    winners.add(player.name);
                }
            }

            if (winners.size() == 1) {
                return winners.get(0) + " wins with " + bestScore + " point" + (bestScore == 1 ? "" : "s") + ".";
            }
            return String.join(" and ", winners) + " tie with " + bestScore + " point" + (bestScore == 1 ? "" : "s") + ".";
        }

        private int countCluesForTarget(String targetPlayerId) {
            int count = 0;
            for (Clue clue : clues) {
                if (Objects.equals(clue.targetPlayerId, targetPlayerId)) {
                    count += 1;
                }
            }
            return count;
        }

        private boolean removeTargetedClues(String targetPlayerId) {
            boolean removedActiveClue = false;
            Iterator<Clue> iterator = clues.iterator();
            while (iterator.hasNext()) {
                Clue clue = iterator.next();
                if (Objects.equals(clue.targetPlayerId, targetPlayerId)) {
                    if (Objects.equals(clue.id, activeClueId)) {
                        activeClueId = null;
                        removedActiveClue = true;
                    }
                    iterator.remove();
                }
            }
            return removedActiveClue;
        }

        private Clue nextAvailableClue() {
            for (Clue clue : clues) {
                if (!clue.used && !Objects.equals(clue.id, activeClueId)) {
                    return clue;
                }
            }
            return null;
        }

        private Clue requireActiveClue() {
            for (Clue clue : clues) {
                if (Objects.equals(clue.id, activeClueId)) {
                    return clue;
                }
            }
            throw new DinoHatException("No active clue.", 409);
        }

        private Player requirePlayer(String playerId) {
            Player player = players.get(playerId);
            if (player == null) {
                throw new DinoHatException("Player not found in this room.", 404);
            }
            return player;
        }

        private void ensureUniqueName(String name) {
            for (Player player : players.values()) {
                if (player.name.equalsIgnoreCase(name)) {
                    throw new DinoHatException("That player name is already in the room.", 409);
                }
            }
        }
    }

    private enum Phase {
        LOBBY,
        CLUE_ENTRY,
        GUESSING,
        FINISHED
    }

    private static final class Player {
        private final String id = UUID.randomUUID().toString();
        private final String name;
        private int score = 0;

        private Player(String name) {
            this.name = name;
        }
    }

    private static final class Clue {
        private final String id = UUID.randomUUID().toString();
        private final String text;
        private final String targetPlayerId;
        private final String submittedByPlayerId;
        private boolean used;

        private Clue(String text, String targetPlayerId, String submittedByPlayerId) {
            this.text = text;
            this.targetPlayerId = targetPlayerId;
            this.submittedByPlayerId = submittedByPlayerId;
        }
    }

    private static final class GuessResult {
        private final boolean correct;

        private GuessResult(boolean correct) {
            this.correct = correct;
        }
    }

    private static final class DinoHatException extends RuntimeException {
        private final int statusCode;

        private DinoHatException(String message, int statusCode) {
            super(message);
            this.statusCode = statusCode;
        }
    }

    @FunctionalInterface
    private interface ExchangeHandler {
        void handle(HttpExchange exchange) throws Exception;
    }
}

import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("coderush.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    language TEXT,
    difficulty TEXT,
    question TEXT,
    expected_pattern TEXT,
    hints TEXT
  );

  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    language TEXT,
    difficulty TEXT,
    score INTEGER,
    date DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    task_id INTEGER,
    question TEXT,
    language TEXT,
    difficulty TEXT,
    status TEXT,
    report TEXT,
    date DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed Tasks if empty
const taskCount = db.prepare("SELECT COUNT(*) as count FROM tasks").get() as { count: number };
if (taskCount.count === 0) {
  const insertTask = db.prepare("INSERT INTO tasks (language, difficulty, question, expected_pattern, hints) VALUES (?, ?, ?, ?, ?)");
  
  const tasks = [
    // C++
    ["cpp", "easy", "Write a function to add two numbers (int add(int a, int b))", "int\\s+add\\s*\\(\\s*int\\s+\\w+\\s*,\\s*int\\s+\\w+\\s*\\)\\s*\\{[^}]*return\\s+\\w+\\s*\\+\\s*\\w+\\s*;?\\s*\\}", "Use int add(int a, int b) { return a + b; }"],
    ["cpp", "medium", "Create a class 'Car' with a constructor", "class\\s+Car\\s*\\{[^}]*Car\\s*\\([^)]*\\)\\s*\\{[^}]*\\}[^}]*\\};?", "Define class Car { Car() {} };"],
    ["cpp", "hard", "Fix memory leak: int* p = new int[5]; (Write the delete statement)", "delete\\s*\\[\\s*\\]\\s*p\\s*;?", "Use delete[] p;"],
    
    // Java
    ["java", "easy", "Print 'Hello World' using System.out.println()", "System\\.out\\.println\\s*\\(\\s*\"Hello World\"\\s*\\)\\s*;?", "System.out.println(\"Hello World\");"],
    ["java", "medium", "Create an ArrayList of Strings named 'list'", "ArrayList\\s*<\\s*String\\s*>\\s+list\\s*=\\s*new\\s+ArrayList\\s*(<\\s*>)?\\s*\\(\\s*\\)\\s*;?", "ArrayList<String> list = new ArrayList<>();"],
    ["java", "hard", "Implement a basic Singleton 'getInstance' method", "public\\s+static\\s+\\w+\\s+getInstance\\s*\\(\\s*\\)\\s*\\{[^}]*return\\s+\\w+\\s*;?\\s*\\}", "Use public static Singleton getInstance() { return instance; }"],

    // HTML/CSS/JS
    ["web", "easy", "Create a red button with text 'Click Me' (HTML)", "<button[^>]*style\\s*=\\s*\"[^\"]*background-color\\s*:\\s*red[^\"]*\"[^>]*>\\s*Click Me\\s*</button>", "<button style=\"background-color: red\">Click Me</button>"],
    ["web", "medium", "Write an arrow function 'square' that returns n * n", "(const|let|var)\\s+square\\s*=\\s*\\(?\\s*n\\s*\\)?\\s*=>\\s*n\\s*\\*\\s*n", "const square = n => n * n;"],
    ["web", "hard", "Add an event listener to 'btn' for 'click' that logs 'hi'", "btn\\.addEventListener\\s*\\(\\s*['\"]click['\"]\\s*,\\s*\\(\\s*\\)\\s*=>\\s*console\\.log\\s*\\(\\s*['\"]hi['\"]\\s*\\)\\s*\\)", "btn.addEventListener('click', () => console.log('hi'))"],

    // Python
    ["python", "easy", "Create a list named 'nums' with values 1 to 5", "nums\\s*=\\s*\\[\\s*1\\s*,\\s*2\\s*,\\s*3\\s*,\\s*4\\s*,\\s*5\\s*\\]", "nums = [1, 2, 3, 4, 5]"],
    ["python", "medium", "Write a lambda function to double an input 'x'", "lambda\\s+x\\s*:\\s*x\\s*\\*\\s*2", "lambda x: x * 2"],
    ["python", "hard", "List comprehension for even numbers in 'range(10)'", "\\[\\s*x\\s+for\\s+x\\s+in\\s+range\\s*\\(\\s*10\\s*\\)\\s+if\\s+x\\s*%\\s*2\\s*==\\s*0\\s*\\]", "[x for x in range(10) if x % 2 == 0]"],

    // ML
    ["ml", "easy", "Import pandas as pd and numpy as np", "import\\s+pandas\\s+as\\s+pd\\s+import\\s+numpy\\s+as\\s+np", "import pandas as pd\nimport numpy as np"],
    ["ml", "medium", "Create a 2x2 numpy array of zeros", "np\\.zeros\\s*\\(\\s*\\(\\s*2\\s*,\\s*2\\s*\\)\\s*\\)", "np.zeros((2, 2))"],
    ["ml", "hard", "Calculate accuracy: (correct / total)", "accuracy\\s*=\\s*correct\\s*/\\s*total", "accuracy = correct / total"]
  ];

  for (const task of tasks) {
    insertTask.run(...task);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // API Routes
  app.get("/api/tasks/:language/:difficulty", (req, res) => {
    const { language, difficulty } = req.params;
    const task = db.prepare("SELECT id, question, hints FROM tasks WHERE language = ? AND difficulty = ? ORDER BY RANDOM() LIMIT 1").get(language, difficulty);
    res.json(task || { error: "No tasks found" });
  });

  app.post("/api/validate", (req, res) => {
    const { taskId, code } = req.body;
    const task = db.prepare("SELECT expected_pattern FROM tasks WHERE id = ?").get(taskId) as { expected_pattern: string };
    
    if (!task) return res.status(404).json({ error: "Task not found" });

    const regex = new RegExp(task.expected_pattern, "i");
    const isCorrect = regex.test(code.replace(/\s+/g, ' ').trim());

    res.json({
      correct: isCorrect,
      output: isCorrect ? "Success!" : "Pattern mismatch",
      error: isCorrect ? null : "The code does not match the expected solution pattern."
    });
  });

  app.post("/api/score", (req, res) => {
    const { username, language, difficulty, score } = req.body;
    db.prepare("INSERT INTO scores (username, language, difficulty, score) VALUES (?, ?, ?, ?)").run(username, language, difficulty, score);
    res.json({ success: true });
  });

  app.get("/api/leaderboard", (req, res) => {
    const leaderboard = db.prepare("SELECT username, score, language, difficulty FROM scores ORDER BY score DESC LIMIT 10").all();
    res.json(leaderboard);
  });

  app.post("/api/history", (req, res) => {
    const { username, taskId, question, language, difficulty, status, report } = req.body;
    db.prepare("INSERT INTO history (username, task_id, question, language, difficulty, status, report) VALUES (?, ?, ?, ?, ?, ?, ?)").run(username, taskId, question, language, difficulty, status, report ? JSON.stringify(report) : null);
    res.json({ success: true });
  });

  app.get("/api/history/:username", (req, res) => {
    const { username } = req.params;
    const history = db.prepare("SELECT question, language, difficulty, status, report, date FROM history WHERE username = ? ORDER BY date DESC").all();
    res.json(history.map((h: any) => ({ ...h, report: h.report ? JSON.parse(h.report) : null })));
  });

  app.delete("/api/history/:username", (req, res) => {
    const { username } = req.params;
    db.prepare("DELETE FROM history WHERE username = ?").run(username);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

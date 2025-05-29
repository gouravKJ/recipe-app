const express = require("express");
const app = express();
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const fs=require("fs");
app.use(cookieParser());

require("dotenv").config();
const multer = require("multer");

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));



const uploadDir = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('Created folder:', uploadDir);
}






// EJS setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueName + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("MongoDB connected"))
  .catch((err) => console.log("Error in connection:", err));

// Schema and Models
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
});

const User = mongoose.model("User", userSchema);

const recipeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  ingredients: { type: String, required: true },
  instructions: { type: String, required: true },
  image: { type: String },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
});

const Recipe = mongoose.model("Recipe", recipeSchema);

// jwt Authentication Middleware
function authenticateToken(req, res, next) {
  const token = req.cookies.token; 

  if (!token) return res.redirect("/login");

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.redirect("/login");
    req.user = user;
    next();
  });
}


// Ownership Check 
async function checkRecipeOwner(req, res, next) {
  const recipeDoc = await Recipe.findById(req.params.id);
  if (!recipeDoc) return res.status(404).send("Recipe not found");

  req.recipe = recipeDoc;
  next();
}

// Routes

// Home: Show all recipes
app.get("/", async (req, res) => {
  const recipes = await Recipe.find().populate("userId", "username").lean();
  res.render("home", { recipes });
});

// Register
app.get("/register", (req, res) => {
  res.render("register");
});

app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.render("register");

  const exists = await User.findOne({ email });
  if (exists) return res.render("register");

  const hashed = await bcrypt.hash(password, 10);
  const newUser = new User({ username, email, password: hashed });
  await newUser.save();
  res.redirect("/login");
});

// Login
app.get("/login", (req, res) => {
  res.render("login");
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const found = await User.findOne({ email });
  if (!found) return res.render("login");



  const isMatch = await bcrypt.compare(password, found.password);
  if (!isMatch) return res.render("login");



  const token = jwt.sign({ id: found._id, username: found.username }, JWT_SECRET, { expiresIn: "1h" });
  res.cookie("token", token, { httpOnly: true });

  res.redirect("/dashboard");
});

// Dashboard
app.get("/dashboard", authenticateToken, async (req, res) => {
  const recipes = await Recipe.find({ userId: req.user.id }).lean();
  res.render("dashboard", { username: req.user.username, recipes });
});

// New recipe form
app.get("/recipes/new", (req, res) => {
  res.render("newrecipe");
});

// Create recipe
app.post("/recipes", authenticateToken, upload.single("image"), async (req, res) => {
  const { title, ingredients, instructions } = req.body;
  const image = req.file ? "/uploads/" + req.file.filename : null;

  const newRecipe = new Recipe({ title, ingredients, instructions, image, userId: req.user.id });
  await newRecipe.save();
  res.redirect("/dashboard");
});




app.get("/recipes/:id", async (req, res) => {
  try {
    const recipeDoc = await Recipe.findById(req.params.id).populate("userId", "username").lean();
    if (!recipeDoc) {
      return res.status(404).send("Recipe not found");
    }
    res.render("recipedetail", { recipe: recipeDoc });
  } catch (error) {
    res.status(500).send("Server error");
  }
});




// Edit recipe form
app.get("/recipes/:id/edit", authenticateToken, checkRecipeOwner, async (req, res) => {
  res.render("editrecipe", { recipe: req.recipe });
});

// Update recipe
app.post("/recipes/:id/edit", authenticateToken, checkRecipeOwner, upload.single("image"), async (req, res) => {
  const { title, ingredients, instructions } = req.body;
  const image = req.file ? "/uploads/" + req.file.filename : null;

  const newRecipe = new Recipe({ title, ingredients, instructions, image, userId: req.user.id });
  await newRecipe.save();
  res.redirect("/dashboard");
});

// Delete recipe
app.post("/recipes/:id/delete", authenticateToken, checkRecipeOwner, async (req, res) => {
  await Recipe.findByIdAndDelete(req.params.id);
  res.redirect("/dashboard");
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running at ${PORT}`);
});

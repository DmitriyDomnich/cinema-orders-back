import "dotenv/config";
import express from "express";
import { dbConnection as db } from "./config/database.js";
import { verifyToken } from "./middleware/auth.js";
import cryption from "bcryptjs";
import jwt from "jsonwebtoken";

db.connect();

const app = express();

app.use(express.json());

app.get("/", verifyToken, (req, res) => {
  res.json({
    name: "Dmytro",
    age: 19,
  });
});

app.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    const [existingUser] = await db.query(
      `select * from users where email='${email}'`
    );

    if (existingUser.length) {
      res.status(409).send("User already exists");
    } else {
      const encryptedPassword = await cryption.hash(password, 10);

      const [user] = await db.query(
        `insert into users(email, password) values('${email}', '${encryptedPassword}')`
      );

      const userJwtToken = jwt.sign(
        { user: user.insertId, email },
        process.env.TOKEN_KEY
      );

      res.status(201).send(userJwtToken);
    }
  } catch (error) {
    console.error(error);
  }
});
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const [[user]] = await db.query(
      `select * from users where email='${email}'`
    );

    if (!user) {
      res.status(400).send("Invalid email or password");
      return;
    }
    const isPasswordCorrect = await cryption.compare(password, user.password);

    if (isPasswordCorrect) {
      const userJwtToken = jwt.sign(
        { user: user.id, email },
        process.env.TOKEN_KEY
      );
      res.status(200).send(userJwtToken);
    } else {
      res.status(400).send("Password not valid");
    }
  } catch (error) {
    console.error(error);
  }
});

export default app;

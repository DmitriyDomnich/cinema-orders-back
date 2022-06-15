import "dotenv/config";
import express from "express";
import { dbConnection as db } from "./config/database.js";
import { verifyToken } from "./middleware/auth.js";
import cors from "cors";
import cryption from "bcryptjs";
import jwt from "jsonwebtoken";

db.connect();

const app = express();

app.use(express.json());
app.use(cors({ origin: "http://localhost:4200" }));

async function getMoviesGenres(sessions) {
  return await Promise.all(
    sessions.map(async (session) => {
      [session.genres] = await db.query(`select g.name, g.id
    from movies m 
    join movie_genres mg on m.id=mg.movie_id
    join genres g on mg.genre_id=g.id
    where m.id=${session.m_id}`);
      return session;
    })
  );
}
async function getMoviesStaffByRole(sessions, role) {
  return await Promise.all(
    sessions.map(async (session) => {
      [session[role.toLowerCase() + "s"]] = await db.query(
        `select s.id, s.name, s.surname
        from movies m
        join movie_staff ms on m.id=ms.movie_id
        join staff s on ms.staff_id=s.id
        where m.id=${session.m_id} and ms.role='${role}'`
      );
      return session;
    })
  );
}

async function getSessionsFilteredByGenres(genres, offset, whereClause) {
  const [sessions] = await db.query(
    `select distinct s.id, m.name, m.id as m_id,  s.date, m.cover_url, m.duration, m.age_restriction, m.country
    from sessions s join movies m on s.movie_id=m.id join movie_genres mg on
    mg.movie_id=m.id where mg.genre_id in (${genres.join()}) ${
      whereClause ? "and " + whereClause.slice(5) : ""
    } order by s.date`
  );
  const length = sessions?.length;
  if (!length) {
    return {
      length: 0,
      sessions: [],
    };
  }
  const offsettedSessions = sessions.slice(offset, offset + 6);
  await Promise.all([
    getMoviesGenres(offsettedSessions),
    getMoviesStaffByRole(offsettedSessions, "Director"),
  ]);
  return { sessions: offsettedSessions, length };
}
async function getSessionsOnlyPaginated(offset, whereClause) {
  const query = `select s.id, m.name, m.id as m_id, s.date, m.cover_url, m.duration, m.age_restriction, m.country
  from sessions s join movies m on s.movie_id=m.id
  ${whereClause || ""}
  order by s.date`;
  console.log(query);
  const [sessions] = await db.query(query);

  const length = sessions?.length;
  const sessionsSliced = sessions.slice(offset, offset + 6);

  if (!length) {
    return {
      length: 0,
      sessions: [],
    };
  }

  await Promise.all([
    getMoviesGenres(sessionsSliced),
    getMoviesStaffByRole(sessionsSliced, "Director"),
  ]);

  return {
    length,
    sessions: sessionsSliced,
  };
}

app.get("/genres", async (req, res) => {
  const [genres] = await db.query(`select * from genres`);
  res.status(200).json(genres);
});

app.get("/session-seats", async (req, res) => {
  try {
    const id = req.query["id"];
    const [seats] = await db.query(
      `select ss.is_available isAvailable, seats.seat, ss.id, seats.price, ss.seat_id seatId
      from sessions s join session_seats ss on s.id=ss.session_id
      join seats on seats.id=ss.seat_id
      where s.id=${id}
      `
    );
    const [[room]] = await db.query(
      `select r.id, r.name, r.format
      from rooms r join seats s on s.room_id=r.id
      where s.id=${seats[0].seatId}`
    );
    console.log(seats[0]);
    res.status(200).json({
      room,
      seats,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

app.get("/session", async (req, res) => {
  try {
    const id = req.query["id"];
    const [session] = await db.query(
      `select s.id, m.name, m.about, m.id as m_id, s.date, m.cover_url as coverUrl, m.portrait_url as portraitUrl, m.duration, m.age_restriction as ageRestriction, m.country
      from sessions s join movies m on s.movie_id=m.id
      where s.id=${id}
      `
    );
    // console.log(session.length, "length", session);
    await Promise.all([
      getMoviesStaffByRole(session, "Director"),
      getMoviesGenres(session),
      getMoviesStaffByRole(session, "Actor"),
    ]);
    res.status(200).json(session[0]);
  } catch (error) {
    res.status(400).send();
    console.error(error);
  }
});

app.get("/sessions", async (req, res) => {
  try {
    const term = req.query["term"];

    const [sessions] = await db.query(
      `select s.id, m.name
      from sessions s join movies m on
      m.id=s.movie_id
      where m.name like '%${term}%'`
    );
    // console.log(sessions);
    res.status(200).json(sessions);
  } catch (error) {
    res.status(403).send();
    console.error(error);
  }
});

app.get("/current-sessions", async (req, res) => {
  try {
    const offset = +req.query["offset"];
    const genres = req.query["genres"]?.split(",");
    const date = req.query["date"];

    console.log(date, "date");

    const whereClause = date
      ? `where s.date between curdate() and FROM_UNIXTIME(${date / 1000})`
      : null;

    let { sessions, length } = genres
      ? await getSessionsFilteredByGenres(genres, offset, whereClause)
      : await getSessionsOnlyPaginated(offset, whereClause);

    res.status(200).json({
      sessions,
      length,
    });
  } catch (error) {
    console.error(error);
  }
});

app.get("/sessions-count", async (req, res) => {
  try {
    const [sessionsCount] = await db.query(
      `select count(*) as length from sessions`
    );
    res.status(200).json(sessionsCount[0]);
  } catch (error) {
    console.error(error);
    res.status(400).send();
  }
});

app.get("/bookings", verifyToken, async (req, res) => {
  try {
    const [seats] = await db.query(
      `select s.id sId, s.seat, s.price, b.is_approved isAvailable, r.name rName, r.format, sesh.date, sesh.id seshId, m.name mName, m.age_restriction ageRestriction
      from bookings b join session_seats ss 
      on b.session_seat_id=ss.id join seats s 
      on ss.seat_id=s.id join rooms r
      on r.id=s.room_id join sessions sesh
      on sesh.id=ss.session_id join movies m
      on m.id=sesh.movie_id
      where b.user_id=${res.locals.userId}`
    );
    res.status(200).json(seats);
  } catch (error) {
    console.error(error);
    res.status(400).send(error);
  }
});

app.post("/bookings", verifyToken, async (req, res) => {
  const { body } = req;
  const values = body.map(({ id }) => [res.locals.userId, id]);
  console.log("body", values);

  try {
    await db.query(`insert into bookings(user_id, session_seat_id) values ?`, [
      values,
    ]);
    res.status(201).send();
  } catch (error) {
    console.error(error);
    res.status(400).send(error);
  }
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

      res.status(201).json(userJwtToken);
    }
  } catch (error) {
    console.error(error);
  }
});
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    // console.log(email, password);
    const [[user]] = await db.query(
      `select * from users where email='${email}'`
    );

    if (!user) {
      // console.log("no user");
      res.status(400).send("Invalid email or password");
      return;
    }
    const isPasswordCorrect = await cryption.compare(password, user.password);
    if (isPasswordCorrect) {
      const userJwtToken = jwt.sign(
        { user: user.id, email },
        process.env.TOKEN_KEY
      );
      res.status(200).json({ token: userJwtToken, isAdmin: !!user.is_admin });
    } else {
      // console.log("pass invalid");
      res.status(400).send("Password not valid");
    }
  } catch (error) {
    console.error(error);
  }
});
app.get("/check-role", verifyToken, async (req, res) => {
  const [[user]] = await db.query(
    `select is_admin isAdmin from users u where u.id=${res.locals.userId}`
  );

  const isAdmin = !!user.isAdmin;
  res.status(200).json(isAdmin);
});

export default app;

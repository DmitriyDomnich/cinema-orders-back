import jwt from "jsonwebtoken";

const { TOKEN_KEY } = process.env;

export const verifyToken = (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(403).send("Provide Authorization Token.");
  }
  try {
    const decoded = jwt.verify(token, TOKEN_KEY);
    res.locals.userId = decoded.user;
  } catch (error) {
    return res.status(401).send("Invalid Token");
  }
  return next();
};

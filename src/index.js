import server from "./app.js";
import aws from "aws-sdk";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import path, { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const port = process.env.API_PORT || 3000;

const { AWS_SECRET_KEY, AWS_ACCESS_KEY } = process.env;

const s3 = new aws.S3({
  credentials: {
    accessKeyId: AWS_ACCESS_KEY,
    secretAccessKey: AWS_SECRET_KEY,
  },
});

const uploadToBucket = async (path) => {
  const data = await fs.readFile(path);
  s3.upload(
    {
      Bucket: "cinema.cdn",
      Key: "images/test/test1.jpg",
      Body: data,
    },
    (err, data) => {
      console.log("uploaded");
    }
  );
};

// uploadToBucket(
//   path.join(__dirname, "./assets/00 - Travi_Scott_Owl_Pharaoh-front-large.jpg")
// );

// server.listen(port, () => {
//   console.log("server running");
// });

import express, { type Express, type Request, type Response } from 'express'
import cors from 'cors';
import dotenv from 'dotenv';
const app: Express = express();
const port =process.env.PORT || 5000;
dotenv.config();

app.use(express.json());
app.use(cors());

app.get('/', (req: Request, res: Response) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
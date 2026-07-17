import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, Collection, ObjectId, Document } from "mongodb";

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 5000;

const uri = process.env.MONGODB_URI as string;
if (!uri) {
  console.error("Error: MONGODB_URI is not defined in your .env file!");
  process.exit(1);
}

const client = new MongoClient(uri);

app.use(express.json());
app.use(cors());

// ---------- Collections ----------
let userCollection: Collection<Document>;
let eventCollection: Collection<Document>;
let sessionCollection: Collection<Document>;

// Extend Request type to carry the authenticated user
interface AuthedRequest extends Request {
  user?: any;
}

// ---------- Auth middleware ----------

const verifyToken = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Unauthorized access" });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized access" });
  }

  try {
    const session = await sessionCollection.findOne({ token });
    if (!session) {
      return res.status(401).json({ message: "Unauthorized access" });
    }

    const user = await userCollection.findOne({
      _id: new ObjectId(session.userId),
    });
    if (!user) {
      return res.status(401).json({ message: "Unauthorized access" });
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(500).json({ message: "Auth check failed" });
  }
};

// role-based guard, e.g. verifyRole("admin") or verifyRole("client", "admin")
const verifyRole = (...allowedRoles: string[]) => {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!allowedRoles.includes(req.user?.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
};

const verifyAdmin = verifyRole("admin");

// ================= MISC ROUTES =================

app.get("/", (req: Request, res: Response) => {
  res.send("Hello World! Server is running.");
});

// ================= USER ROUTES (admin only) =================

app.get(
  "/api/users",
  verifyToken,
  verifyAdmin,
  async (req: Request, res: Response) => {
    try {
      if (!userCollection) {
        res.status(500).send({ error: "Database not initialized yet!" });
        return;
      }
      const result = await userCollection
        .find({})
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    } catch (error) {
      res.status(500).send({ error: (error as Error).message });
    }
  },
);

// update a user's role/profile (admin only)
app.patch(
  "/api/users/:id",
  verifyToken,
  verifyAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        res.status(400).send({ error: "Invalid user id" });
        return;
      }
      const updatedData = { ...req.body, updatedAt: new Date() };
      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData },
      );
      res.send(result);
    } catch (error) {
      res.status(500).send({ error: (error as Error).message });
    }
  },
);

app.delete(
  "/api/users/delete/:id",
  verifyToken,
  verifyAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        res.status(400).send({ error: "Invalid user id" });
        return;
      }
      const result = await userCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    } catch (error) {
      res.status(500).send({ error: (error as Error).message });
    }
  },
);

// ================= EVENT ROUTES (CRUD) =================

// Create event — client or admin
app.post(
  "/api/event/post",
  verifyToken,
  verifyRole("client", "admin"),
  async (req: AuthedRequest, res: Response) => {
    try {
      if (!eventCollection) {
        res.status(500).send({ error: "Database not initialized yet!" });
        return;
      }
      const newEvent = {
        ...req.body,
        createdBy: req.user?._id,
        createdAt: new Date(),
      };
      const result = await eventCollection.insertOne(newEvent);
      res.status(201).send(result);
    } catch (error) {
      res.status(500).send({ error: (error as Error).message });
    }
  },
);

// Get all events
app.get(
  "/api/admin/events",
  verifyToken,
  verifyAdmin,
  async (req: Request, res: Response) => {
    try {
      if (!eventCollection) {
        res.status(500).send({ error: "Database not initialized yet!" });
        return;
      }
      const result = await eventCollection
        .find({})
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    } catch (error) {
      res.status(500).send({ error: (error as Error).message });
    }
  },
);
// Get all events
app.get("/api/events", async (req: Request, res: Response) => {
  try {
    if (!eventCollection) {
      res.status(500).send({ error: "Database not initialized yet!" });
      return;
    }
    const query: any = {
      publishStatus: "published",
    };
    const result = await eventCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: (error as Error).message });
  }
});

// Get single event details
app.get("/api/event/:id", async (req: Request, res: Response) => {
  try {
    if (!eventCollection) {
      res.status(500).send({ error: "Database not initialized yet!" });
      return;
    }
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      res.status(400).send({ error: "Invalid event id" });
      return;
    }
    const result = await eventCollection.findOne({ _id: new ObjectId(id) });
    if (!result) {
      res.status(404).send({ error: "Event not found" });
      return;
    }
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: (error as Error).message });
  }
});

// Update event — only the creator (client) or an admin
app.patch(
  "/api/event/update/:id",verifyToken,verifyAdmin,async (req: AuthedRequest, res: Response) => {
    try {
      if (!eventCollection) {
        res.status(500).send({ error: "Database not initialized yet!" });
        return;
      }
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        res.status(400).send({ error: "Invalid event id" });
        return;
      }

      const event = await eventCollection.findOne({ _id: new ObjectId(id) });
      if (!event) {
        res.status(404).send({ error: "Event not found" });
        return;
      }

      if (
        event.createdBy?.toString() !== req.user?._id.toString() &&
        req.user?.role !== "admin"
      ) {
        res.status(403).send({ error: "Forbidden" });
        return;
      }

      const updatedData = { ...req.body, updatedAt: new Date() };
      const result = await eventCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData },
      );
      res.send(result);
    } catch (error) {
      res.status(500).send({ error: (error as Error).message });
    }
  },
);

// Delete event — only the creator an admin
app.delete(
  "/api/event/delete/:id",
  verifyToken,
  verifyAdmin,
  async (req: AuthedRequest, res: Response) => {
    try {
      if (!eventCollection) {
        res.status(500).send({ error: "Database not initialized yet!" });
        return;
      }
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        res.status(400).send({ error: "Invalid event id" });
        return;
      }

      const event = await eventCollection.findOne({ _id: new ObjectId(id) });
      if (!event) {
        res.status(404).send({ error: "Event not found" });
        return;
      }

      if (
        event.createdBy?.toString() !== req.user?._id.toString() &&
        req.user?.role !== "admin"
      ) {
        res.status(403).send({ error: "Forbidden" });
        return;
      }

      const result = await eventCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    } catch (error) {
      res.status(500).send({ error: (error as Error).message });
    }
  },
);

// ================= DB CONNECTION =================

export async function connectToMongoDB() {
  try {
    await client.connect();
    const database = client.db("event-vibe");
    userCollection = database.collection("user");
    eventCollection = database.collection("event");
    sessionCollection = database.collection("session");
    console.log("Successfully connected to MongoDB!");
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  }
}

// ---------- Start server only after DB is ready ----------
async function start() {
  await connectToMongoDB();
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

start();

import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, Collection, ObjectId } from "mongodb";
import type { Document } from "mongodb";

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 5000;

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error(
    "FATAL: MONGODB_URI environment variable is not set. Set it in your hosting platform's environment variables.",
  );
}

// Only construct the client if we actually have a URI, so a missing env var
// doesn't crash the whole process at import time (important for serverless
// cold starts, where the module can be re-evaluated).
const client = uri ? new MongoClient(uri) : null;

const allowedOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(express.json());
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : "*",
    credentials: true,
  }),
);

// Make sure every request has a DB connection ready (handles cold starts on
// serverless platforms, where a top-level connect before the first request
// isn't guaranteed to have finished yet). connectToMongoDB() itself caches
// the connection, so this is cheap on warm invocations.
app.use(async (_req: Request, _res: Response, next: NextFunction) => {
  try {
    await connectToMongoDB();
  } catch {
    // Route handlers already check `if (!xCollection)` and return a clean
    // 500, so we just let the request continue rather than hard-failing
    // the middleware chain here.
  }
  next();
});

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
      const id = req.params.id; // 👈 dynamic types override context set up hobe
      
      if (typeof id !== "string" || !ObjectId.isValid(id)) {
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
      
      if (typeof id !== "string" || !ObjectId.isValid(id)) {
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
    if (typeof id !== "string" || !ObjectId.isValid(id)) {
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
  "/api/event/update/:id",
  verifyToken,
  verifyRole("client", "admin"),
  async (req: AuthedRequest, res: Response) => {
    try {
      if (!eventCollection) {
        res.status(500).send({ error: "Database not initialized yet!" });
        return;
      }

      const id = req.params.id;

      // 🟢 Type Guard: Ensure 'id' is a string before passing to ObjectId
      if (typeof id !== "string" || !ObjectId.isValid(id)) {
        res.status(400).send({ error: "Invalid event id" });
        return;
      }

      const event = await eventCollection.findOne({ _id: new ObjectId(id) });
      if (!event) {
        res.status(404).send({ error: "Event not found" });
        return;
      }

      // 🟢 Safe handling for req.user._id to prevent TypeScript error
      const loggedInUserId = req.user?._id;
      
      // Ensure we have a valid single string ID for the user
      const userIdString = Array.isArray(loggedInUserId) 
        ? loggedInUserId[0] 
        : (loggedInUserId as string | undefined);

      // 🟢 check user authorization safely
      if (
        event.createdBy?.toString() !== userIdString?.toString() &&
        req.user?.role !== "admin"
      ) {
        res.status(403).send({ error: "Forbidden" });
        return;
      }

      const updatedData = { ...req.body, updatedAt: new Date() };
      
      // MongoDB update করার সময়ও আইডি সেফলি পাস করা হলো
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

// Delete event — only the creator or an admin
app.delete(
  "/api/event/delete/:id",
  verifyToken,
  verifyRole("client", "admin"),
  async (req: AuthedRequest, res: Response) => {
    try {
      if (!eventCollection) {
        res.status(500).send({ error: "Database not initialized yet!" });
        return;
      }
      
      const id = req.params.id;

      // 🟢 Type Guard: Ensure 'id' is a string
      if (typeof id !== "string" || !ObjectId.isValid(id)) {
        res.status(400).send({ error: "Invalid event id" });
        return;
      }

      const event = await eventCollection.findOne({ _id: new ObjectId(id) });
      if (!event) {
        res.status(404).send({ error: "Event not found" });
        return;
      }

      // 🟢 safe check of creator ownership
      if (
        event.createdBy?.toString() !== req.user?._id?.toString() &&
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

// Tracks whether we've already connected, so serverless warm invocations
// (or accidental repeat calls) don't reconnect every time.
let dbConnectionPromise: Promise<void> | null = null;

export function connectToMongoDB(): Promise<void> {
  if (!client) {
    return Promise.reject(
      new Error("MONGODB_URI is not set — cannot connect to MongoDB."),
    );
  }

  // Reuse an in-flight or already-resolved connection instead of opening a
  // new one on every call (important on Vercel, where the module can be
  // reused across warm invocations of the same function).
  if (!dbConnectionPromise) {
    dbConnectionPromise = client
      .connect()
      .then(() => {
        const database = client.db("event-vibe");
        userCollection = database.collection("user");
        eventCollection = database.collection("event");
        sessionCollection = database.collection("session");
        console.log("Successfully connected to MongoDB!");
      })
      .catch((err) => {
        console.error("Failed to connect to MongoDB:", err);
        // Allow a future request to retry instead of getting stuck forever
        // on a failed connection attempt.
        dbConnectionPromise = null;
        throw err;
      });
  }

  return dbConnectionPromise;
}

// Vercel imports this file as a serverless function and calls the exported
// app directly — it must NOT call app.listen() itself. Every other platform
// (Render, Railway, a plain VPS, local dev) needs a real listening server.
export default app;

if (process.env.VERCEL !== "1") {
  connectToMongoDB()
    .catch(() => {
      // Error already logged in connectToMongoDB; keep booting so the
      // health check route still responds and ops can see the server is up
      // but misconfigured.
    })
    .finally(() => {
      app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
      });
    });
}

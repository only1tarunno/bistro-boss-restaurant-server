require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;

// middle ware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.USER}:${process.env.KEY}@cluster0.a27cvav.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const userCollection = client.db("bistroDB").collection("usersCollection");
    const menuCollection = client.db("bistroDB").collection("menuCollection");
    const reviewCollection = client
      .db("bistroDB")
      .collection("reviewsCollection");
    const cartCollection = client.db("bistroDB").collection("cartCollection");
    const paymentCollection = client
      .db("bistroDB")
      .collection("paymentCollection");

    // jwt related api

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "365d",
      });
      res.send({ token });
    });

    // our middleware
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "forbidden" });
      }
      const token = req.headers.authorization.split(" ")[1];
      // token verify
      jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "UnAuthorized" });
        }
        req.user = decoded;
        next();
      });
    };

    // use verify admin after verify token
    const verifyAdmin = async (req, res, next) => {
      const email = req.user.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "unauthorized" });
      }
      next();
    };

    // menu related api
    app.get("/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

    app.get("/menu/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await menuCollection.findOne(filter);
      res.send(result);
    });

    app.post("/menu", verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await menuCollection.insertOne(item);
      res.send(result);
    });

    app.patch("/menu/:id", async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          ...item,
        },
      };
      const result = await menuCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.delete("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    });

    // users related api
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // check admin
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.user.email) {
        return res.status(403).send({ message: "unauthorized" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exixts" });
      } else {
        const result = await userCollection.insertOne(user);
        res.send(result);
      }
    });
    // make user admin
    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );
    // user delete
    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = {
        _id: new ObjectId(id),
      };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // review collection api
    app.get("/reviews", async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });

    // carts collection api

    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });
    app.post("/carts", async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    });

    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = {
        _id: new ObjectId(id),
      };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    // payment related api
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const ammount = parseInt(price * 100);
      if (ammount < 1) return;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: ammount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.get("/payments/:email", verifyToken, async (req, res) => {
      const useremail = req.params.email;
      const query = { email: useremail };
      if (useremail !== req.user.email) {
        return res.status(403).send({ message: "forbidden" });
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/payments", async (req, res) => {
      const payment = req.body;

      const result = await paymentCollection.insertOne(payment);

      // carefully delete each item on the cart
      const query = {
        _id: {
          $in: payment.cartIds.map((id) => new ObjectId(id)),
        },
      };

      const deleteResult = await cartCollection.deleteMany(query);

      res.send({ result, deleteResult });
    });

    // stats or analytics
    app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const menuItems = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();

      // // this is not best way
      // const payments = await paymentCollection.find().toArray();
      // const revenue = payments.reduce(
      //   (total, payment) => total + parseFloat(payment.price),
      //   0
      // );

      const result = await paymentCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalrevenue: {
                $sum: "$price",
              },
            },
          },
        ])
        .toArray();

      const revenue = result.length > 0 ? result[0].totalrevenue : 0;

      res.send({ users, menuItems, orders, revenue });
    });

    // using aggregate pipeline for revenue
    app.get("/order-stats", verifyToken, verifyAdmin, async (req, res) => {
      const result = await paymentCollection
        .aggregate([
          {
            $unwind: "$menuItemIds",
          },
          {
            $lookup: {
              from: "menuCollection",
              let: { menuItemId: { $toObjectId: "$menuItemIds" } }, // Convert menuItemIds to ObjectId
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: ["$$menuItemId", "$_id"], // Compare converted menuItemIds with _id in menuCollection
                    },
                  },
                },
              ],
              as: "menuItems",
            },
          },
          {
            $unwind: "$menuItems",
          },
          {
            $group: {
              _id: "$menuItems.category",
              quantity: {
                $sum: 1,
              },
              totalrevenue: {
                $sum: "$menuItems.price",
              },
            },
          },
          {
            $project: {
              _id: 0,
              category: "$_id",
              quantity: "$quantity",
              totalrevenue: "$totalrevenue",
            },
          },
        ])
        .toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("server is running");
});

app.listen(port);

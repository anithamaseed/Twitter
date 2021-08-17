const express = require("express");
const app = express();
app.use(express.json());

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

let database = null;

const initializeDbAndStartServer = async () => {
  try {
    database = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndStartServer();

//API 1

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const selectUserQuery = `select * from user where username='${username}';`;
  const databaseUser = await database.get(selectUserQuery);
  if (databaseUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const insertUserQuery = `insert into user(username, password, name, gender) values('${username}','${hashedPassword}','${name}','${gender}');`;
      await database.run(insertUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

//API 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `select * from user where username='${username}';`;
  const databaseUser = await database.get(selectUserQuery);
  if (databaseUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      databaseUser.password
    );
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API 3

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

const convertDbObjToResponsiveObj = (dbObj) => {
  return {
    username: dbObj.username,
    tweet: dbObj.tweet,
    dateTime: dbObj.date_time,
  };
};

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const selectLatestTweetQuery = `select
     distinct username, tweet, date_time
      from follower inner join tweet
      on follower.following_user_id=tweet.user_id
    inner join user 
      on tweet.user_id=user.user_id 
      order by date_time desc
      limit 4;`;
  const getLatestTweet = await database.all(selectLatestTweetQuery);
  response.send(
    getLatestTweet.map((each) => convertDbObjToResponsiveObj(each))
  );
});

//API 4

app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  const selectUserFollowingQuery = `
     select name
    from follower inner join user
    on follower.following_user_id=user.user_id
    where follower_user_id=(select user_id from user where username='${username}');`;
  const getFollowing = await database.all(selectUserFollowingQuery);
  response.send(getFollowing.map((each) => ({ name: each.name })));
});

//API 5

app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const selectUserFollowersQuery = `
    select name
    from follower inner join user
    on follower.follower_user_id=user.user_id
    where following_user_id=(select user_id from user where username='${username}');`;
  const getFollowers = await database.all(selectUserFollowersQuery);
  response.send(getFollowers.map((each) => ({ name: each.name })));
});

//API 6
/*
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getTweetIdQuery = `
  select tweet, count(like_id) as count_like, tweet.date_time, count(reply) as count_reply
  from tweet inner join like
  on tweet.tweet_id=like.tweet_id
  inner join reply 
  on reply.tweet_id=tweet.tweet_id
  where tweet.tweet_id='${tweetId}' and tweet.user_id in (select following_user_id as user_id from follower where follower_user_id=(select user_id from user where username='${username}'))
  group by tweet.tweet_id;`;
  const getTweet = await database.get(getTweetIdQuery);
  if (getTweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send({
      tweet: getTweet.tweet,
      likes: getTweet.count_like,
      replies: getTweet.count_reply,
      dateTime: getTweet.date_time,
    });
  }
});
*/

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getTweetIdQuery = `
  select tweet, count(like_id) as count_like, tweet.date_time, count(reply) as count_reply
  from tweet inner join like
  on tweet.tweet_id=like.tweet_id
  inner join reply 
  on reply.tweet_id=tweet.tweet_id
  where tweet.tweet_id='${tweetId}' and tweet.user_id in (select following_user_id as user_id from follower where follower_user_id=(select user_id from user where username<>'${username}'))
  group by tweet.tweet_id;`;
  const getTweet = await database.get(getTweetIdQuery);
  if (getTweetIdQuery) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send({
      tweet: getTweet.tweet,
      likes: getTweet.count_like,
      replies: getTweet.count_reply,
      dateTime: getTweet.date_time,
    });
  }
});



//API 7

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getTweetIdQuery = `
  select username
  from user inner join like on user.user_id=like.user_id
  where tweet_id='${tweetId}';`;
    const getTweet = await database.all(getTweetIdQuery);
    if (getTweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send({
        likes: getTweet.map((each) => each.username),
      });
    }
  }
);

//API 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getTweetIdQuery = `
  select name, reply
  from user inner join reply on user.user_id=reply.user_id
  inner join follower on follower.following_user_id=reply.user_id
  where tweet_id='${tweetId}' and follower_user_id=(select user_id from user where username='${username}');`;
    const getTweet = await database.all(getTweetIdQuery);
    if (getTweet !== undefined) {
      response.send({
        replies: getTweet.map((each) => each),
      });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 9

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getTweetOfAllUsersQuery = `
    select tweet, count(like_id) as count_like, count(reply_id) as count_reply, tweet.date_time
    from tweet left join like on
    tweet.user_id=like.user_id
    inner join reply on
    tweet.user_id=reply.user_id
    inner join user on
    user.user_id=tweet.user_id
    where tweet.user_id=(select user_id from user where username='${username}')
     group by tweet.tweet_id;`;
  const getTweet = await database.all(getTweetOfAllUsersQuery);
  response.send(
    getTweet.map((each) => ({
      tweet: each.tweet,
      likes: each.count_like,
      replies: each.count_reply,
      dateTime: each.date_time,
    }))
  );
});

//API 10

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const postTweetQuery = `
    insert into tweet(tweet)
    values('${tweet}');`;
  await database.run(postTweetQuery);
  response.send("Created a Tweet");
});

//API 11

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const delTweetUserQuery = `
        delete from tweet
    where tweet_id='${tweetId}' and 
    tweet.user_id=(select user_id from user where username='${username}');`;
    if (await database.run(delTweetUserQuery)) {
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;

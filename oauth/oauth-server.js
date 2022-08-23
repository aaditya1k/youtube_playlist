const axios = require("/usr/local/lib/node_modules/axios");
const http = require("http");
const fs = require("fs");
const { URL, URLSearchParams } = require("url");
const { convertToSlug } = require("../functions");

const PORT = process.env.PORT || 3000;
const CLIENT_SECRET = JSON.parse(fs.readFileSync(__dirname + "/../client_secret.json", "utf8"));
const USER_SECRET_PATH = __dirname + "/../user_secret.json";
const REDIRECT_URI = `http://localhost:${PORT}/google-redirect`;

async function handleOauthToken(searchParams) {
  const formParams = {
    code: searchParams.get("code"),
    client_id: CLIENT_SECRET.web.client_id,
    client_secret: CLIENT_SECRET.web.client_secret,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code"
  };
  const url = new URLSearchParams();
  for (const p in formParams) {
    url.append(p, formParams[p]);
  }

  try {
    const response = await axios.post("https://oauth2.googleapis.com/token", url, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
    console.log(response);
    fs.writeFileSync(USER_SECRET_PATH, "" + JSON.stringify(response.data, null, 2) + "\n");
    return true;
  } catch (ex) {
    console.log(ex);
    if (ex.isAxiosError) {
      console.log(`Google response when fetching refresh_token`, ex.response && ex.response.data ? ex.response.data : "");
    }
    return ex.toString();
  }
}

const server = http.createServer();

server.on("request", async (req, res) => {
  const {pathname, searchParams} = new URL("http://127.0.0.1" + req.url);
  // console.log(`${req.method} ${req.url}`, pathname);

  switch (pathname) {
    case "/":
      res.writeHead(200, { "Content-Type": "text/html; charset-utf8" });
      res.end(`Use <a href="/oauth-verify">/oauth-verify<a/> for fetching oauth token.`);
      break;

    case "/oauth-verify":
      res.writeHead(200, { "Content-Type": "text/html; charset-utf8" });
      fs.createReadStream(__dirname + "/oauth.html").pipe(res);
      break;

    case "/oauth-values":
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        scope: "https://www.googleapis.com/auth/youtube.readonly",
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_SECRET.web.client_id
      }));
      break;

    case "/google-redirect":
      res.writeHead(200, { "Content-Type": "text/html; charset-utf8" });
      if (searchParams.has("error")) {
        res.end(`Looks like received error from google`);
      } else {
        const response = await handleOauthToken(searchParams);
        res.end(response === true
          ? "Saved google oauth token in " + USER_SECRET_PATH
          : "Error: " + response
        );
      }
      break;

    case "/videos":
      res.writeHead(200, { "Content-Type": "text/html; charset-utf8" });
      fs.createReadStream(__dirname + "/videos.html").pipe(res);
      break;

    case "/videos/playlists":
      res.writeHead(200, { "Content-Type": "application/json" });
      const playlists = JSON.parse(fs.readFileSync(
        __dirname + "/../output/" + searchParams.get("playlists_folder") + "/playlists.json"
      , "utf8"));
      res.end(JSON.stringify({
        playlists: playlists
      }));
      break;

    case "/videos/videos":
      res.writeHead(200, { "Content-Type": "application/json" });
      const playlistFolder = searchParams.get("playlists_folder");
      const playlistId = searchParams.get("playlist_id");
      const playlistTitle = convertToSlug(searchParams.get("playlist_title"));
      const videos = JSON.parse(fs.readFileSync(
        __dirname + "/../output/" + playlistFolder + `/playlist_${playlistId.toLowerCase()}_${playlistTitle}.json`
      , "utf8"));
      res.end(JSON.stringify({
        videos: videos
      }));
      break;


    default:
      res.writeHead(404, { "Content-Type": "text/html; charset-utf8" });
      res.end(`404 not found.`);
  }
});

server.listen(PORT);

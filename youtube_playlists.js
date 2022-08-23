const axios = require("/usr/local/lib/node_modules/axios");
const fs = require("fs");
const { URLSearchParams } = require("url");
const { convertToSlug } = require("./functions");

const CLIENT_SECRET = JSON.parse(fs.readFileSync(__dirname + "/client_secret.json", "utf8"));
const USER_SECRET = __dirname + "/user_secret.json";
const USER_SECRET_TEMP = __dirname + "/user_secret_temp.json";
const TOKEN = {access_token: null, expire: null};

const OUTPUT_FOLDER = (() => {
  let outputPath = __dirname + "/output/";
  const now = new Date();
  outputPath += `${now.getUTCFullYear()}_${now.getUTCMonth() + 1}_${now.getUTCDate()}`;
  let i = 0;
  console.log(`Setting output folder...`);
  while (true) {
    if (fs.existsSync(outputPath + "_" + i)) {
      ++i;
      continue;
    }
    fs.mkdirSync(outputPath + "_" + i);
    break;
  }
  return outputPath + "_" + i;
})();

const PLAYLISTS_OUTPUT = OUTPUT_FOLDER + "/playlists.json";

function currentTime() {
  return Math.floor((new Date().getTime()) / 1000);
}

function isTokenExpired(expire) {
  return (expire > currentTime()) ? false : true;
}

async function getToken() {
  if (TOKEN.access_token && !isTokenExpired(TOKEN.expire)) {
    return TOKEN.access_token;
  }

  const userSecretTemp = fs.existsSync(USER_SECRET_TEMP)
    ? JSON.parse(fs.readFileSync(USER_SECRET_TEMP, "utf8"))
    : false;

  if (userSecretTemp && !isTokenExpired(userSecretTemp.expire)) {
    TOKEN.access_token = userSecretTemp.access_token;
    TOKEN.expire = userSecretTemp.expire;
    return TOKEN.access_token;
  }

  const userSecret = JSON.parse(fs.readFileSync(USER_SECRET, "utf8"));
  const formParams = {
    client_id: CLIENT_SECRET.web.client_id,
    client_secret: CLIENT_SECRET.web.client_secret,
    grant_type: "refresh_token",
    refresh_token: userSecret.refresh_token
  };
  const url = new URLSearchParams();
  for (const p in formParams) {
    url.append(p, formParams[p]);
  }

  try {
    const response = await axios.post("https://oauth2.googleapis.com/token", url, {
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    // console.log(response);
    const now = currentTime();
    const data = {
      ...response.data,
      now: now,
      expire: (now + response.data.expires_in) - 10 // decreasing expire time to 10 seconds
    };
    fs.writeFileSync(USER_SECRET_TEMP, "" + JSON.stringify(data, null, 2) + "\n");

    TOKEN.access_token = data.access_token;
    TOKEN.expire = data.expire;
    return TOKEN.access_token;
  } catch (ex) {
    console.log(ex);
    if (ex.isAxiosError) {
      console.log(`Google response when fetching refresh_token`, ex.response && ex.response.data ? ex.response.data : "");
    }
    throw new Error(`Unable to fetch refresh_token`);
  }
}

async function getPlaylists(token, pageToken) {
  const params = {
    part: "contentDetails,id,snippet,status",
    mine: "true",
    maxResults: 50,  // default is 5, max 50
    pageToken: pageToken
  };
  const queryString = [];
  for (const p in params) {
    if (params[p] && params[p] !== null) {
      queryString.push(p + "=" + encodeURIComponent(params[p]));
    }
  }

  const url = "https://www.googleapis.com/youtube/v3/playlists?" + queryString.join("&");
  const response = await axios.get(url, {
    headers: { Authorization: "Bearer " + token }
  });
  return response.data;
}

async function getAllPlaylists() {
  let i = 0;
  const playlists = await getPlaylists(await getToken());
  console.log(`Total Playlists: ${playlists.pageInfo.totalResults}`);
  let items = [];
  items = items.concat(playlists.items);
  console.log(`${i} Fetched ${items.length}/${playlists.pageInfo.totalResults}`);
  let nextPageToken = playlists.nextPageToken;
  while (nextPageToken) {
    ++i;
    const morePlaylists = await getPlaylists(await getToken(), nextPageToken);
    items = items.concat(morePlaylists.items);
    console.log(`${i} Fetched ${items.length}/${morePlaylists.pageInfo.totalResults}`);
    nextPageToken = morePlaylists.nextPageToken;
  }
  console.log(`Total playlists fetched: ${items.length}/${playlists.pageInfo.totalResults}`);
  fs.writeFileSync(PLAYLISTS_OUTPUT, "" + JSON.stringify(items, null, 2) + "\n");
}

async function getPlaylistItems(token, playlistId, pageToken) {
  const params = {
    part: "contentDetails,id,snippet,status",
    playlistId: playlistId,
    maxResults: 50,  // default is 5, max 50
    pageToken: pageToken
  };
  const queryString = [];
  for (const p in params) {
    if (params[p] && params[p] !== null) {
      queryString.push(p + "=" + encodeURIComponent(params[p]));
    }
  }

  const url = "https://www.googleapis.com/youtube/v3/playlistItems?" + queryString.join("&");
  const response = await axios.get(url, {
    headers: { Authorization: "Bearer " + token }
  });
  return response.data;
}

async function getAllPLaylistItems(playlistId, playlistTitle) {
  let i = 0;
  const playlistItems = await getPlaylistItems(await getToken(), playlistId);
  console.log(`Total videos: ${playlistItems.pageInfo.totalResults}`);
  let items = [];
  items = items.concat(playlistItems.items);
  console.log(`${i} Fetched ${items.length}/${playlistItems.pageInfo.totalResults}`);
  let nextPageToken = playlistItems.nextPageToken;
  while (nextPageToken) {
    ++i;
    const morePlaylistItems = await getPlaylistItems(await getToken(), playlistId, nextPageToken);
    items = items.concat(morePlaylistItems.items);
    console.log(`${i} Fetched ${items.length}/${morePlaylistItems.pageInfo.totalResults}`);
    nextPageToken = morePlaylistItems.nextPageToken;
  }
  console.log(`Total videos fetched: ${items.length}/${playlistItems.pageInfo.totalResults}`);
  const playlistFile = `/playlist_${playlistId.toLowerCase()}_${convertToSlug(playlistTitle)}.json`;
  fs.writeFileSync(OUTPUT_FOLDER + playlistFile, "" + JSON.stringify(items, null, 2) + "\n");
}

function readPlaylistsFile() {
  return JSON.parse(fs.readFileSync(PLAYLISTS_OUTPUT));
}

(async () => {
  try {
    await getAllPlaylists();
  } catch (ex) {
    console.log(ex);
    throw new Error(`When fetching all playlists`, ex);
  }

  try {
    const playlists = readPlaylistsFile();
    for (const playlist of playlists) {
      console.log("\n---- " + playlist.snippet.localized.title + " " + playlist.contentDetails.itemCount + " videos");
      await getAllPLaylistItems(playlist.id, playlist.snippet.localized.title);
    }
  } catch (ex) {
    console.log(ex);
    throw new Error(`When fetching all videos`, ex);
  }

  console.log(`Saved all playlist items in ${OUTPUT_FOLDER}`);
})();

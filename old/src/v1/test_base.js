import "dotenv/config";
import { Client } from "discord.js";

const client = new Client({
  intents: ["Guilds", "GuildMembers", "GuildMessages", "MessageContent", "GuildVoiceStates"],
});
client.on("ready", () => {
  console.log("Bob is now online!");
});

const IGNORE_PREFIX = "!";
const CHANNELS = JSON.parse(process.env.DISCORD_CHANNELS);

client.on("messageCreate", async (message) => {
  if (!CHANNELS.includes(message.channelId) && !message.mentions.users.has(client.user.id)) return;
  if (message.author.bot) return;

  if (message.content === "!reset") {
    await sendMessage("ok", message.channel);
    return;
  }

  if (message.content.startsWith(IGNORE_PREFIX)) return;
  await sendMessage("hi", message.channel);
});

/**
 * Sends a message in the given channel, emulating typing time and splitting up large messages.
 */
async function sendMessage(msgToSend, channel) {
  channel.send(msgToSend);
}

client.login(process.env.DISCORD_TOKEN);

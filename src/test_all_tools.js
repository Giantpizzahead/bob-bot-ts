import "dotenv/config";

// Langchain tests

import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const llm = new ChatOpenAI({
  apiKey: process.env.OPENAI_KEY,
  model: "gpt-4o-mini",
  temperature: 1,
  max_tokens: 256,
  top_p: 1,
  frequency_penalty: 0.05,
  presence_penalty: 0.05,
});

const factualLLM = new ChatOpenAI({
  apiKey: process.env.OPENAI_KEY,
  model: "gpt-4o-mini",
  temperature: 0,
  max_tokens: 256,
  frequency_penalty: 0.05,
  presence_penalty: 0.05,
});

// ===== Web Search =====

import { DuckDuckGoSearch } from "@langchain/community/tools/duckduckgo_search";

const webSearchTool = new DuckDuckGoSearch({ maxResults: 7 });

// ===== Image Search =====

import { searchImages } from "duck-duck-scrape";

const imageSearchSchema = z.object({
  query: z.string().describe("The image search query."),
});

const imageSearchTool = tool(
  async ({ query }) => {
    // Try up to 5 times
    for (let i = 0; i < 5; i++) {
      try {
        const MAX_RESULTS = 7;
        const { results } = await searchImages(query);
        const formattedResults = JSON.stringify(
          results
            .map((result) => ({
              title: result.title,
              imageURL: result.image,
              width: result.width,
              height: result.height,
            }))
            .slice(0, MAX_RESULTS),
        );
        console.log(formattedResults);
        console.log(`Number of attempts: ${i + 1}`);
        return formattedResults;
      } catch (e) {
        console.log(`ERROR (Image attempt ${i + 1}):`, e);
      }
    }
    console.log("Empty search (too many attempts)");
    return "[]"; // Empty search attempt
  },
  {
    name: "image-search",
    description:
      "An image search engine. Useful for when you need to find or want to react with an image. Input should be a search query.",
    schema: imageSearchSchema,
  },
);

// ===== Fetch Webpage =====

import { WebBrowser } from "langchain/tools/webbrowser";

const embeddings = new OpenAIEmbeddings({ apiKey: process.env.OPENAI_KEY });
const browser = new WebBrowser({ model: factualLLM, embeddings });

const fetchWebpageSchema = z.object({
  url: z.string().describe("The URL of the webpage to fetch."),
  prompt: z
    .string()
    .describe(
      "A prompt for the LLM, which will read the text on the webpage and attempt to answer the prompt based on the content it finds.",
    ),
});

const fetchWebpageTool = tool(
  async ({ url, prompt }) => {
    const result = await browser.invoke(`"${url}","${prompt}"`);
    console.log(result);
    const splitLoc = result.indexOf("### Relevant Links");
    // sendDiscordMessage(`-> ${result.substring(0, splitLoc)}`);
    return result;
  },
  {
    name: "fetch-webpage",
    description:
      "Can answer a prompt about the contents of a webpage at a given URL. Useful for finding and collecting specific info.",
    schema: fetchWebpageSchema,
  },
);

// ===== Fetch YouTube Video =====

import { YoutubeLoader } from "@langchain/community/document_loaders/web/youtube";

const fetchYouTubeSchema = z.object({
  url: z.string().describe("The URL of the YouTube video."),
  language: z.string().optional().describe("The language code for the transcript. Defaults to 'en'."),
});

/**
 * Extracts the videoId from a YouTube video, livestream, or short URL.
 * Adapted from LangChain's YoutubeLoader.
 * @param url The URL of the YouTube video.
 * @returns The videoId of the YouTube video.
 */
function getVideoID(url) {
  const match = url.match(/.*(?:youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|live\/|shorts\/)([^#&?]*).*/);
  if (match !== null && match[1].length === 11) {
    return match[1];
  } else {
    throw new Error("Failed to get youtube video id from the url");
  }
}

const fetchYouTubeTool = tool(
  // Possible errors: Transcripts could be disabled, video ID could be invalid
  async ({ url, language = "en" }) => {
    const loader = new YoutubeLoader({
      videoId: getVideoID(url),
      language,
      addVideoInfo: true,
    });
    const docs = (await loader.load())[0];
    // Keep the start and end of the transcript if it's too long
    const MAX_CHUNK_LEN = 4096;
    if (docs.pageContent.length > 2 * MAX_CHUNK_LEN) {
      docs.pageContent = docs.pageContent.slice(0, MAX_CHUNK_LEN) + docs.pageContent.slice(-MAX_CHUNK_LEN);
    }
    console.log(docs);
    // sendDiscordMessage(`-> ${docs.metadata.title}\n${docs.pageContent.substring(0, 1024)}...`);
    return JSON.stringify(docs);
  },
  {
    name: "fetch-youtube-video",
    description: "Fetches the metadata (title, description, author, etc.) and transcript of a YouTube video.",
    schema: fetchYouTubeSchema,
  },
);

// ===== Fetch JS Webpage =====

// import { PuppeteerWebBaseLoader } from "@langchain/community/document_loaders/web/puppeteer";

// const loader = new PuppeteerWebBaseLoader("https://www.youtube.com/watch?v=oUOgq6ePC_4&t=5117s", {
//   launchOptions: {
//     headless: false,
//   },
//   // required params = ...
//   // optional params = ...
// });

// const docs = await loader.load();
// console.dir(docs[0]);

// const screenshot = await loader.screenshot();

// console.log(screenshot.pageContent.slice(0, 100));
// console.log(screenshot.metadata);

// ===== Calculator =====

const calculatorSchema = z.object({
  operation: z.enum(["add", "subtract", "multiply", "divide"]).describe("The type of operation to execute."),
  number1: z.number().describe("The first number to operate on."),
  number2: z.number().describe("The second number to operate on."),
});

const calculatorTool = tool(
  async ({ operation, number1, number2 }) => {
    let result;
    // Functions must return strings
    if (operation === "add") {
      result = `${number1 + number2}`;
    } else if (operation === "subtract") {
      result = `${number1 - number2}`;
    } else if (operation === "multiply") {
      result = `${number1 * number2}`;
    } else if (operation === "divide") {
      result = `${number1 / number2}`;
    } else {
      throw new Error("Invalid operation.");
    }
    // sendDiscordMessage(`-> ${result}`);
    return result;
  },
  {
    name: "calculator",
    description: "Can perform mathematical operations.",
    schema: calculatorSchema,
  },
);

// ===== Image Generation =====

import { DallEAPIWrapper } from "@langchain/openai";

const imageGenTool = new DallEAPIWrapper({
  n: 1, // Default
  model: "dall-e-2", // Default
  apiKey: process.env.OPENAI_KEY, // Default
});

const toolsByName = {
  "duckduckgo-search": webSearchTool,
  "image-search": imageSearchTool,
  "fetch-webpage": fetchWebpageTool,
  "fetch-youtube-video": fetchYouTubeTool,
  calculator: calculatorTool,
  dalle_api_wrapper: imageGenTool,
};
const llmWithTools = llm.bindTools([
  webSearchTool,
  imageSearchTool,
  fetchWebpageTool,
  fetchYouTubeTool,
  calculatorTool,
  imageGenTool,
]);

async function getResponse(message) {
  // Ex: Monday, August 19, 2024 at 11:37 PM
  const currDateTime = new Date().toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
    timeZone: "PST",
  });
  const messages = [
    new SystemMessage(
      `You are a Discord user named Bob chatting in a private Discord server. Bob is a rising junior majoring in CS at MIT and is a witty gamer. There are other users too. Avoid rambling for too long, split long messages into short ones, and don't repeat yourself. Keep messages like reddit comments - short, witty, and in all lowercase, with abbreviations and little care for grammar. Use the web search tool to get context before answering the user (if needed). DO NOT USE duckduckgo-search MORE THAN TWICE. Don't send webpage links to the user, but remember to send image URL links. Try to find images online if possible, as opposed to generating a new one. Output at most 1 image in a single message, as a plain URL with no markdown - only if it fits and is a valid image. If you really don't know the answer, say you don't know - do not make up info. The current date is ${currDateTime}.`,
    ),
    new HumanMessage(message),
  ];

  // Repeatedly call tools until the AI gives a response
  let aiMessage;
  for (let i = 0; i < 7; i++) {
    aiMessage = await llmWithTools.invoke(messages);
    messages.push(aiMessage);
    if (aiMessage.tool_calls.length !== 0) {
      for (const toolCall of aiMessage.tool_calls) {
        let debugMsg = `[${toolCall.name}] with arguments ${JSON.stringify(toolCall.args).replace("https://", "")}`;
        // sendDiscordMessage(debugMsg);
        const selectedTool = toolsByName[toolCall.name];
        const toolMessage = await selectedTool.invoke(toolCall);
        if (toolCall.name === "duckduckgo-search") {
          let debugMsg = "->\n";
          for (const result of JSON.parse(toolMessage.content)) {
            debugMsg += `[${result.title}](<${result.link}>)\n`;
          }
          // sendDiscordMessage(debugMsg);
        } else if (toolCall.name === "image-search") {
          let debugMsg = "->\n";
          for (const result of JSON.parse(toolMessage.content)) {
            debugMsg += `[${result.title}](<${result.imageURL}>)\n`;
          }
          // sendDiscordMessage(debugMsg);
        } else if (toolCall.name === "web-browser") {
          console.log(toolMessage.content);
        }
        messages.push(toolMessage);
      }
    } else break;
  }

  // Output response
  // console.log(messages);
  let response = aiMessage.content;
  if (response.trim().length === 0) response = "Unable to answer within 7 iterations D:";
  let fullResponse = `\n\n${response}`;
  return fullResponse;
}

// Discord handling

import { Client } from "discord.js";

const client = new Client({
  intents: ["Guilds", "GuildMembers", "GuildMessages", "MessageContent", "GuildVoiceStates"],
});
client.on("ready", () => {
  console.log("Bob is now online!");
});

let activeChannel;

function sendDiscordMessage(messageStr) {
  if (!activeChannel) throw new Error("No active channel!");
  activeChannel.send(messageStr.substring(Math.max(messageStr.length - 1980, 0)));
}

const CHANNELS = JSON.parse(process.env.DISCORD_CHANNELS);
client.on("messageCreate", async (message) => {
  if (!CHANNELS.includes(message.channelId) && !message.mentions.users.has(client.user.id)) return;
  if (message.author.bot) return;
  activeChannel = message.channel;
  try {
    sendDiscordMessage(await getResponse(message.content));
  } catch (e) {
    console.log(e);
    sendDiscordMessage(e.toString());
  }
});

client.login(process.env.DISCORD_TOKEN);

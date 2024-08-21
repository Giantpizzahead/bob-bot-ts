import "dotenv/config";

// Langchain tests

import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

const llm = new ChatOpenAI({
  apiKey: process.env.OPENAI_KEY,
  model: "gpt-4o-mini",
  temperature: 1,
  max_tokens: 256,
  top_p: 1,
  frequency_penalty: 0.05,
  presence_penalty: 0.05,
});

// ===== Web Search =====

import { DuckDuckGoSearch } from "@langchain/community/tools/duckduckgo_search";

const webSearchTool = new DuckDuckGoSearch({ maxResults: 7 });

import { MemorySaver } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { END, START, StateGraph } from "@langchain/langgraph";

// Define the state interface
// interface AgentState {
//   messages: HumanMessage[];
// }

// Define the graph state
const graphState = {
  messages: {
    value: (x, y) => x.concat(y),
    default: () => [],
  },
};

// Define the tools for the agent to use
const tools = [webSearchTool];

const toolNode = new ToolNode(tools);

const model = llm.bindTools(tools);

// Define the function that determines whether to continue or not
function shouldContinue(state) {
  const messages = state.messages;

  const lastMessage = messages[messages.length - 1];

  // If the LLM makes a tool call, then we route to the "tools" node
  if (lastMessage.additional_kwargs.tool_calls) {
    return "tools";
  }
  // Otherwise, we stop (reply to the user)
  return END;
}

// Define the function that calls the model
async function callModel(state) {
  const messages = state.messages;

  const response = await model.invoke(messages);

  // We return a list, because this will get added to the existing list
  return { messages: [response] };
}

// Define a new graph
const workflow = new StateGraph({ channels: graphState })
  .addNode("agent", callModel)
  .addNode("tools", toolNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", shouldContinue)
  .addEdge("tools", "agent");

// Initialize memory to persist state between graph runs
const checkpointer = new MemorySaver();

// Finally, we compile it!
// This compiles it into a LangChain Runnable.
// Note that we're (optionally) passing the memory when compiling the graph
const app = workflow.compile({ checkpointer });

// Use the agent
const finalState = await app.invoke(
  { messages: [new HumanMessage("what is the weather in sf")] },
  { configurable: { thread_id: "42" } },
);

console.log(finalState.messages[finalState.messages.length - 1].content);

const nextState = await app.invoke(
  { messages: [new HumanMessage("what about ny")] },
  { configurable: { thread_id: "42" } },
);

console.log(nextState.messages[nextState.messages.length - 1].content);

async function getResponse(message) {
  const messages = [
    new SystemMessage(
      `You are a Discord user named Bob chatting in a private Discord server. Bob is a rising junior majoring in CS at MIT and is a witty gamer. There are other users too. Avoid rambling for too long, split long messages into short ones, and don't repeat yourself. Keep messages like reddit comments - short, witty, and in all lowercase, with abbreviations and little care for grammar.`,
    ),
    new HumanMessage(message),
  ];
  let response = await llm.invoke(messages);
  return response.content;
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

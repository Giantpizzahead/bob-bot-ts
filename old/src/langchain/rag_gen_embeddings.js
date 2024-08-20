import 'dotenv/config';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { readFile } from 'fs/promises';
import { createClient } from '@supabase/supabase-js'
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase'
import { OpenAIEmbeddings } from '@langchain/openai'

try {
    const text = await readFile('res/knowledge_swarm.txt', 'utf-8');
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
        separators: ['\n\n', '\n', ' ', ''] // default setting
    });
    
    const output = await splitter.createDocuments([text]);

    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    await SupabaseVectorStore.fromDocuments(
        output,
        new OpenAIEmbeddings({ apiKey: process.env.OPENAI_KEY }),
        {
           client,
           tableName: 'documents',
        }
    );
    console.log("Embeddings created and uploaded!");
} catch (err) {
    console.log(err);
}

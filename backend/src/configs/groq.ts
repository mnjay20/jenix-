import Groq from "groq-sdk";
import { env } from "../utils/env.js";


export const groq = new Groq({
    apiKey: env.STT_KEY
});



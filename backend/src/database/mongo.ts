import {MongoClient,Db} from "mongodb"
import dns from "dns"
import { env } from "../utils/env.js"

dns.setServers(['8.8.8.8', '8.8.4.4'])

import { logger } from "../utils/logger.js"

let client : MongoClient | null = null
let db : Db | null = null


export async function getClient():Promise<MongoClient>{
    if(!client){
        client = new MongoClient(env.MONGO_DB_URI, {
            serverSelectionTimeoutMS: 10000,
            connectTimeoutMS: 10000,
        })
        try {
            await client.connect()
            logger.info("Successfully connected to MongoDB database")
        } catch (err) {
            client = null;
            logger.error("Failed to connect to MongoDB:", err);
            throw err;
        }
        return client
    }

    return client
}

export async function getDb():Promise<Db>{
    if(!db){
        try {
            const extractClient = await getClient()
            db = extractClient.db(env.MONGO_DB_NAME)
            logger.info(`using Db ->${env.MONGO_DB_NAME}`)
            return db
        } catch (err) {
            db = null;
            throw err;
        }
    }
    return db
}

import {Server } from 'socket.io'

let io : Server

export function initSocketServer(server : any){
    io = new Server(server,{
        cors : {
            origin : '*'
        }
    })
}

export function getIO(){
    return io
}
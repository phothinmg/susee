import { staticServer } from "@suseejs/static";

const server = staticServer({ staticDir: "_site" });

server.start();

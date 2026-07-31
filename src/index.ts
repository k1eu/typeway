import { Elysia, t } from "elysia";

const app = new Elysia()
  .get(
    "/",
    {
      query: t.Object({
        name: t.String(),
      }),
    },
    ({ query }) =>
      new Response(
        `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hello ${query.name}</title>
  </head>
  <body>
    <h1>Hello ${query.name}</h1>
  </body>
</html>`,
        {
          headers: { "content-type": "text/html; charset=utf-8" },
        },
      ),
  )
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);

# @rate-fence/express

Express middleware for [RateFence](https://github.com/Alisherkhan032/rate-fence).

```bash
npm install rate-fence @rate-fence/express express
```

```ts
import express from "express";
import { createRateFence } from "rate-fence";
import { rateFenceExpress } from "@rate-fence/express";

const app = express();
const fence = createRateFence({
  rateLimit: { algorithm: "sliding-window", windowMs: 60_000, maxRequests: 100 },
});

app.use(rateFenceExpress(fence));
```

See the root README for full documentation.

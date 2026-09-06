# N-class plan — production readback

Evidence order after merge:

1. Vercel deployment reaches READY;
2. public `/` is 200;
3. both health endpoints are 200;
4. config and demo routes are 200;
5. anonymous sponsored Compute remains rejected;
6. production runtime logs contain no bootstrap crash or secret disclosure.

A Vercel build/deploy success without public route readback is insufficient.

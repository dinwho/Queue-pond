# Notes

```
docker ps
```
lists all the running processes

``` 
docker run -d --name nats-server -p 4222:4222 -p 8222:8222 nats:latest -js 
```
- docker run: Starts a new container.
- -d: Runs it in the background (detached mode).
- --name nats-server: Gives the container a friendly name.
- -p 4222:4222: Maps port 4222 (the default port applications use to talk to NATS) from inside the container to your local computer.
- -p 8222:8222: Maps port 8222 (the NATS HTTP monitoring dashboard port).
nats:latest: Downloads the official, lightweight NATS image.
- -js: Crucial flag! Enables JetStream (without -js, NATS runs in fire-and-forget mode).


Running the headless browser on a seperate docker container and the worker containers will opearate through websockets

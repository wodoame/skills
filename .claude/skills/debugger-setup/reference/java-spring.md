# Java / Spring Boot (JDK 9+)

Debug agent (JDWP), injected via env so the Dockerfile's `CMD` is untouched:

    JAVA_TOOL_OPTIONS=-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005

`address=*:5005` is required on JDK 9+ to listen on all interfaces; the older `address=5005` binds to localhost inside the container only, so the host can't connect.

## Docker override: `.local/docker-compose.debug.yml`

    services:
      <service-name>:
        ports:
          - "5005:5005"
        environment:
          - JAVA_TOOL_OPTIONS=-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005
        healthcheck:
          disable: true
        restart: "no"

Run: `docker compose -f docker-compose.yml -f .local/docker-compose.debug.yml up --build`

## Editors

### Zed (needs the Java extension)
`.zed/debug.json`:

    [
      {
        "label": "Attach to <service> (Docker :5005)",
        "adapter": "Java",
        "request": "attach",
        "hostName": "localhost",
        "port": 5005
      }
    ]

Optional `.zed/tasks.json` with `Docker: start backend (debug)` and `Docker: stop backend` tasks running the compose commands above. Start with `task: spawn`, attach with `debug: start`.
The key names for the Java adapter were written from memory of the extension's docs: check its README if Zed rejects the config.

### VS Code (Extension Pack for Java)
`.vscode/launch.json`:

    { "version": "0.2.0", "configurations": [
      { "type": "java", "name": "Attach to Docker :5005", "request": "attach",
        "hostName": "localhost", "port": 5005 } ] }

### IntelliJ IDEA
Run > Edit Configurations > + > **Remote JVM Debug**, host `localhost`, port `5005`, "Use module classpath" = the app module. To keep it untracked, don't tick "Store as project file" (it then stays in `.idea/workspace.xml`).

## Local process / tests
- Spring Boot from the editor: use the editor's Java launch/attach config with main class `@SpringBootApplication`, or `./mvnw spring-boot:run -Dspring-boot.run.jvmArguments="-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=*:5005"` then attach as above.
- A single test: `./mvnw -Dmaven.surefire.debug test -Dtest=ClassName` waits on port 5005 for the debugger.

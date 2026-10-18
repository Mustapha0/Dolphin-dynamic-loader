# In-app build diagnostics

The build screen now includes an expandable **Build diagnostics / full error** panel. It displays the server's returned build error plus recent npm/Gradle output and offers a Copy logs button. On a failed build, the panel opens automatically. The server API already returns the captured error tail, so redeploy the updated server and rebuild/reinstall the Android app to use the new screen.

Validation: server JavaScript syntax and embedded app script syntax should be checked before deployment. This is a diagnostics UI change; it does not itself fix the underlying Gradle failure.

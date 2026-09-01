# VHS tape recording script for CODEXA Terminal Agent Demo
# Output: packages/web/public/demo.gif

Output packages/web/public/demo.gif

Set FontSize 15
Set Width 1200
Set Height 720
Set Theme "Catppuccin Mocha"
Set Padding 20
Set WindowBar macOS

# 1. Launch CODEXA in terminal
Type "codexa"
Sleep 500ms
Enter
Sleep 1.5s

# 2. Explore repository in PLAN mode
Type "/mode PLAN"
Enter
Sleep 800ms

Type "Explain the dual execution engine architecture in this repository."
Enter
Sleep 3s

# 3. Switch to BUILD mode to make a targeted code edit
Type "/mode BUILD"
Enter
Sleep 800ms

Type "Add a unit test for the doctor diagnostic health checker in packages/cli/test/doctor.test.ts"
Enter
Sleep 4s

# 4. Open CodexaLens code intelligence workspace & Activity Timeline
Type "/lens"
Enter
Sleep 3.5s

# 5. Exit session cleanly
Hide
Type "exit"
Enter

; Uninstalling Task Bar puts Windows' own taskbar back the way it was before Task Bar tucked it away.
; (Updates also run the old uninstaller; skip it then, so the taskbar doesn't flicker on every update.)
!macro customUnInstall
  ${ifNot} ${isUpdated}
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --restore-taskbar'
  ${endIf}
!macroend

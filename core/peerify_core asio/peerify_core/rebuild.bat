@echo off
set MSBUILD="C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Current\Bin\amd64\MSBuild.exe"
set PROJECT="c:\Users\anton\Desktop\peerify\core\peerify_core asio\peerify_core\peerify_core.vcxproj"
%MSBUILD% %PROJECT% /p:Configuration=Release /p:Platform=x64 /t:Rebuild
if %errorlevel% neq 0 (
  echo Build failed!
  exit /b %errorlevel%
)
copy /y "c:\Users\anton\Desktop\peerify\core\peerify_core asio\peerify_core\x64\Release\peerify_core.dll" "c:\Users\anton\Desktop\peerify\ui\peerify\core\peerify_core.dll"
if %errorlevel% neq 0 (
  echo Copy failed!
  exit /b %errorlevel%
)
echo Rebuild and copy successful!

@rem
@rem Copyright 2021 the original author or authors.
@rem
@rem Licensed under the Apache License, Version 2.0 (the "License");
@rem you may not use this file except in compliance with the License.
@rem You may obtain a copy of the License at
@rem
@rem      https://www.apache.org/licenses/LICENSE-2.0
@rem
@rem Unless required by applicable law or agreed to in writing, software
@rem distributed under the License is distributed on an "AS IS" BASIS,
@rem WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
@rem See the License for the specific language governing permissions and
@rem limitations under the License.
@rem

@if "%DEBUG%"=="" @echo off
@rem %~dp0 - drive and path of this script
@rem %~nx0 - file name and extension of this script
@rem %* - all command line arguments

set APP_HOME=%~dp0
set APP_NAME=Gradle
set DEFAULT_JVM_OPTS=

@rem Find java.exe
if defined JAVA_HOME goto findJavaFromJavaHome

set JAVA_EXE=java.exe
%JAVA_EXE% -version >NUL 2>&1
if "%ERRORLEVEL%"=="0" goto init

echo.
echo ERROR: JAVA_HOME is not defined and no 'java' command could be found in your PATH.
echo.
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation.

goto fail

:findJavaFromJavaHome
set JAVA_HOME=%JAVA_HOME:"=%
set JAVA_EXE=%JAVA_HOME%/bin/java.exe

if exist "%JAVA_EXE%" goto init

echo.
echo ERROR: JAVA_HOME is set to an invalid directory: %JAVA_HOME%
echo.
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation.

goto fail

:init
@rem Get command-line arguments, handling Windowz variants
if not "%OS%"=="Windows_NT" goto win9xME_args
if "%@eval[2+2]uda"=="4uda" goto winNT_args

:win9xME_args
@rem Slurp the command line arguments.
set CMD_LINE_ARGS=
set _SKIP=2

:win9xME_args_slurp
if "x%~1"=="x" goto execute

set CMD_LINE_ARGS=%*
goto execute

:winNT_args
@rem Get arguments from the Windows Management Instrumentation command-line interface (wmic)
set CMD_LINE_ARGS=*
goto execute

:execute
@rem Setup the command line
set CLASSPATH=%APP_HOME%\gradle\wrapper\gradle-wrapper.jar

@rem Execute Gradle
"%JAVA_EXE%" %DEFAULT_JVM_OPTS% %JAVA_OPTS% %GRADLE_OPTS% "-Dorg.gradle.appname=%APP_NAME%" -classpath "%CLASSPATH%" org.gradle.wrapper.GradleWrapperMain %CMD_LINE_ARGS%

:end
@rem End of script
@rem Local Variables:
@rem tab-width:4
@rem indent-tabs-mode:t
@rem End:
@rem vim:noexpandtab:shiftwidth=4:tabstop=4:

:fail
rem Set variable GRADLE_EXIT_CONSOLE_ERROR if you want the script to return a non-zero exit code on error.
set EXIT_CODE=1
if not "%EXIT_CODE%"=="" exit /b %EXIT_CODE%

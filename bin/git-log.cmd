@echo off

REM Shows date, hash, and message with dividers
git --no-pager log -5 --date=format:%%Y-%%m-%%d_%%H:%%M:%%S --format="> %%ad - %%H %%n%%B%%n%%n"

@REM use below command to call in terminal directly:
@REM git --no-pager log -5 --date=format:%%Y-%%m-%%d_%%H:%%M:%%S --format="> %%ad - %%H%%n%%B%%n%%n"

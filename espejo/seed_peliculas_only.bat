@echo off
setlocal

set YTDLP=C:\ATLAS_PUSH\_external\RAULI-VISION\espejo\yt-dlp.exe
set VAULT=C:\ATLAS_PUSH\_external\RAULI-VISION\espejo\storage\vault

rem --- Flags comunes ---
set COMMON=--no-warnings --retries 2 --no-mtime --no-part --ignore-errors --match-filter "duration > 90" --max-filesize 300m --max-downloads 5

rem --- Video: forzar MP4 <=480p, nunca webm ---
set VIDEO=--format "bestvideo[ext=mp4][height<=480]+bestaudio[ext=m4a]/best[ext=mp4][height<=480]/mp4" --merge-output-format mp4

echo === CAMI/peliculas (Superlibro episodios MP4) ===
%YTDLP% %COMMON% %VIDEO% --output "%VAULT%\cami\peliculas\%%(title)s.%%(ext)s" -- https://www.youtube.com/@superlibrola --playlist-items 1-5
echo CAMI/peliculas done.

echo === VARIADO/peliculas (cine latino gratis MP4) ===
%YTDLP% %COMMON% %VIDEO% --output "%VAULT%\variado\peliculas\%%(title)s.%%(ext)s" -- https://www.youtube.com/@peliculasvideosgratis https://www.youtube.com/@cinelatino
echo VARIADO/peliculas done.

echo === PELICULAS COMPLETADAS ===
endlocal

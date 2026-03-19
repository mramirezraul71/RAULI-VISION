@echo off
setlocal

set YTDLP=C:\ATLAS_PUSH\_external\RAULI-VISION\espejo\yt-dlp.exe
set VAULT=C:\ATLAS_PUSH\_external\RAULI-VISION\espejo\storage\vault

rem --- Flags comunes para todas las descargas ---
set COMMON=--no-warnings --retries 2 --no-mtime --no-part --ignore-errors --match-filter "duration > 90" --max-filesize 300m --max-downloads 5

rem --- Audio: MP3 extraído ---
set AUDIO=--format 140/bestaudio --extract-audio --audio-format mp3 --audio-quality 5

rem --- Video: forzar MP4 <=480p, nunca webm ---
set VIDEO=--format "bestvideo[ext=mp4][height<=480]+bestaudio[ext=m4a]/best[ext=mp4][height<=480]/mp4" --merge-output-format mp4

echo === CAMI/musica (musica cristiana en espanol) ===
%YTDLP% %COMMON% %AUDIO% --output "%VAULT%\cami\musica\%%(title)s.%%(ext)s" -- https://www.youtube.com/@MarcosWitt https://www.youtube.com/@christinedclario https://www.youtube.com/@generacion12
echo CAMI/musica done.

echo === VARIADO/musica (reggaeton y urbano latino) ===
%YTDLP% %COMMON% %AUDIO% --output "%VAULT%\variado\musica\%%(title)s.%%(ext)s" -- https://www.youtube.com/@badbunnypr https://www.youtube.com/@ozunapr https://www.youtube.com/@maiangelvevo
echo VARIADO/musica done.

echo === CAMI/musicvideos (videoclips cristianos MP4) ===
%YTDLP% %COMMON% %VIDEO% --output "%VAULT%\cami\musicvideos\%%(title)s.%%(ext)s" -- https://www.youtube.com/@MarcosWitt https://www.youtube.com/@christinedclario
echo CAMI/musicvideos done.

echo === VARIADO/musicvideos (videoclips urbanos MP4) ===
%YTDLP% %COMMON% %VIDEO% --output "%VAULT%\variado\musicvideos\%%(title)s.%%(ext)s" -- https://www.youtube.com/@badbunnypr https://www.youtube.com/@ozunapr
echo VARIADO/musicvideos done.

echo === CAMI/peliculas (Superlibro episodios MP4) ===
%YTDLP% %COMMON% %VIDEO% --output "%VAULT%\cami\peliculas\%%(title)s.%%(ext)s" -- https://www.youtube.com/@superlibrola --playlist-items 1-5
echo CAMI/peliculas done.

echo === VARIADO/peliculas (cine latino gratis MP4) ===
%YTDLP% %COMMON% %VIDEO% --output "%VAULT%\variado\peliculas\%%(title)s.%%(ext)s" -- https://www.youtube.com/@peliculasvideosgratis https://www.youtube.com/@cinelatino
echo VARIADO/peliculas done.

echo === TODAS LAS DESCARGAS COMPLETADAS ===
endlocal

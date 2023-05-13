from pytube import YouTube
import pygame
import tkinter as tk

class MusicPlayer:
    def __init__(self, master):
        self.master = master
        master.title("YouTube Music Player")

        # criar a entrada de texto para a URL da música
        self.url_entry = tk.Entry(master)
        self.url_entry.pack()

        # criar o botão "Play"
        self.play_button = tk.Button(master, text="Play", command=self.play_music)
        self.play_button.pack()
    

        # inicializar a biblioteca Pygame
        pygame.init()
        pygame.mixer.init()
       


    def play_music(self):
        # obter a URL da entrada de texto
        url = self.url_entry.get()

        # criar um objeto YouTube
        yt = YouTube(url)

        # extrair o áudio do vídeo
        audio = yt.streams.filter(only_audio=True).first()

        # fazer o download do áudio
        audio.download(output_path='.', filename='music')

        # carregar a música e reproduzi-la
        pygame.mixer.music.load('music.mp4')
        pygame.mixer.music.play()

root = tk.Tk()
player = MusicPlayer(root)
root.mainloop()

import tkinter as tk
import pygame
from pytube import YouTube

class MusicPlayer:
    def __init__(self, master):
        self.master = master
        master.title("Music Player")

        # cria os botões
        self.play_button = tk.Button(master, text="Play", command=self.play_music)
        self.pause_button = tk.Button(master, text="Pause", command=self.pause_music)
        self.stop_button = tk.Button(master, text="Stop", command=self.stop_music)

        # posiciona os botões na tela
        self.play_button.pack(side=tk.LEFT, padx=10)
        self.pause_button.pack(side=tk.LEFT, padx=10)
        self.stop_button.pack(side=tk.LEFT, padx=10)

        # inicializa a biblioteca Pygame
        pygame.init()
        pygame.mixer.init()

        # baixa o áudio do vídeo do YouTube
        self.youtube_link = "https://music.youtube.com/watch?v=rISYCquFeI8&list=RDAMVMrISYCquFeI8"
        self.yt = YouTube(self.youtube_link)
        self.music_file = self.yt.streams.filter(only_audio=True).first().download()
        self.music = pygame.mixer.music.load(self.music_file)

        

    def play_music(self):
        pygame.mixer.music.play()

    def pause_music(self):
        pygame.mixer.music.pause()

    def stop_music(self):
        pygame.mixer.music.stop()

root = tk.Tk()
music_player = MusicPlayer(root)
root.mainloop()

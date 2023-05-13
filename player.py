import pygame
import tkinter as tk
from tkinter import filedialog

class MusicPlayer:
    def __init__(self, master):
        self.master = master
        master.title("Music Player")

        # criar o botão "Abrir"
        self.open_button = tk.Button(master, text="Abrir", command=self.open_file)
        self.open_button.pack()

        # criar a lista de reprodução
        self.playlist = tk.Listbox(master)
        self.playlist.pack()

        # criar o botão "Play"
        self.play_button = tk.Button(master, text="Play", command=self.play_music)
        self.play_button.pack()

        # criar o botão "Pause"
        self.pause_button = tk.Button(master, text="Pause", command=self.pause_music)
        self.pause_button.pack()

        # criar o botão "Stop"
        self.stop_button = tk.Button(master, text="Stop", command=self.stop_music)
        self.stop_button.pack()

        # criar a barra de progresso
        self.progress_bar = tk.Scale(master, from_=0, to=100, orient=tk.HORIZONTAL, length=200, showvalue=False)
        self.progress_bar.pack()

        # inicializar a biblioteca Pygame
        pygame.init()
        pygame.mixer.init()

        # inicializar as variáveis de controle da música
        self.music_files = []
        self.music_playing = False
        self.current_music_index = None

    def open_file(self):
        # abrir a janela de diálogo para selecionar o arquivo de música
        file_paths = filedialog.askopenfilenames(defaultextension=".mp3", filetypes=[("Arquivos de música", "*.mp3"), ("Todos os arquivos", "*.*")])
        if file_paths:
            # adicionar os arquivos de música selecionados à lista de reprodução
            for file_path in file_paths:
                self.music_files.append(file_path)
                self.playlist.insert(tk.END, file_path)

            # selecionar a primeira música da lista de reprodução
            self.playlist.selection_clear(0, tk.END)
            self.playlist.selection_set(0)
            self.current_music_index = 0
            self.music_playing = False

    def play_music(self):
        if self.music_files:
            # carregar a música selecionada e reproduzi-la
            selection = self.playlist.curselection()
            if selection:
                index = selection[0]
                if index != self.current_music_index:
                    self.current_music_index = index
                    self.music_playing = False

            if not self.music_playing:
                self.music_file = self.music_files[self.current_music_index]
                pygame.mixer.music.load(self.music_file)
                pygame.mixer.music.play()
                self.music_playing = True

    def pause_music(self):
        if self.music_playing:
            # pausar a música
            pygame.mixer.music.pause()
            self.music_playing = False

    def stop_music(self):
        if self.music_playing:
            # parar a música
            pygame.mixer.music.stop()
            self.music_playing = False

    def update_progress_bar(self):
        if self.music_playing:
            # atualizar a barra de progresso
            time_elapsed = pygame.mixer.music.get_pos() / 1000  # converter para segundos
            total_time = pygame.mixer.music.get_length() / 1000  # converter para segundos
            progress_percent = (time_elapsed / total_time) * 100
            self.progress_bar.set(progress_percent)
        else:
            # reiniciar a barra de progresso
            self.progress_bar.set(0)

        # chamar esta função novamente após um curto período de tempo
        self.master.after(100, self.update_progress_bar)

    def run(self):
        # iniciar a atualização da barra de progresso
        self.update_progress_bar()

        # executar a interface do usuário
        self.master.mainloop()

if __name__ == "__main__":
    root = tk.Tk()
    music_player = MusicPlayer(root)
    music_player.run()


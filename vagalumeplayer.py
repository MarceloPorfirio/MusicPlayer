import requests
from bs4 import BeautifulSoup
import pygame

# URL da página com a música
url = 'https://www.vagalume.com.br/iron-maiden/fear-of-the-dark.html'

# enviar uma solicitação HTTP e analisar o HTML
response = requests.get(url)
soup = BeautifulSoup(response.text, 'html.parser')

# encontrar o link de download da música
audio_element = soup.find('audio')
if audio_element:
    music_url = audio_element['src']
else:
    download_link = soup.select_one('.download-btn')
    if download_link:
        music_url = download_link['href']
    else:
        print('Link de download não encontrado.')
        exit()

# baixar a música e salvá-la em um arquivo
response = requests.get(music_url)
with open('music.mp3', 'wb') as f:
    f.write(response.content)

# inicializar a biblioteca Pygame
pygame.init()
pygame.mixer.init()

# carregar a música e reproduzi-la
pygame.mixer.music.load('music.mp3')
pygame.mixer.music.play()

# manter a reprodução da música até que seja interrompida
while pygame.mixer.music.get_busy():
    pass

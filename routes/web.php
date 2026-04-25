<?php

use Illuminate\Support\Facades\Route;

Route::view('/', 'app');
Route::view('/{any}', 'app')->where('any', '^(?!api|storage|build|fonts).*$');

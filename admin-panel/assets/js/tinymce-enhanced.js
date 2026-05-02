(function (window, $) {
    'use strict';

    var storedConfigs = {};
    var cachedContent = {};

    function isDarkMode() {
        return document.body.classList.contains('dark');
    }

    function getThemeConfig() {
        return isDarkMode() ? {
            skin: 'oxide-dark',
            content_css: 'dark'
        } : {
            skin: 'oxide',
            content_css: 'default'
        };
    }

    function getContentStyle() {
        if (isDarkMode()) {
            return 'body{font-family:Inter,sans-serif;background:#111827;color:#e5e7eb;font-size:15px;line-height:1.7;}a{color:#7dd3fc;}img{max-width:100%;height:auto;}figure{margin:1.2rem 0;}figcaption{color:#9ca3af;}table{border-collapse:collapse;width:100%;}table td,table th{border:1px solid #374151;padding:8px;}blockquote{border-left:4px solid #38bdf8;margin:1rem 0;padding:0.75rem 1rem;color:#cbd5e1;background:#0f172a;border-radius:0 8px 8px 0;}pre{background:#020617;color:#e5e7eb;padding:12px;border-radius:8px;overflow:auto;}';
        }

        return 'body{font-family:Inter,sans-serif;background:#ffffff;color:#111827;font-size:15px;line-height:1.7;}a{color:#2563eb;}img{max-width:100%;height:auto;}figure{margin:1.2rem 0;}figcaption{color:#6b7280;}table{border-collapse:collapse;width:100%;}table td,table th{border:1px solid #d1d5db;padding:8px;}blockquote{border-left:4px solid #2563eb;margin:1rem 0;padding:0.75rem 1rem;color:#374151;background:#f8fafc;border-radius:0 8px 8px 0;}pre{background:#111827;color:#f9fafb;padding:12px;border-radius:8px;overflow:auto;}';
    }

    function uploadImage(blobInfo, success, failure, progress, uploadUrl) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', uploadUrl);

        xhr.upload.onprogress = function (event) {
            if (event.lengthComputable && typeof progress === 'function') {
                progress((event.loaded / event.total) * 100);
            }
        };

        xhr.onload = function () {
            var json;

            if (xhr.status < 200 || xhr.status >= 300) {
                failure('Échec du téléversement (' + xhr.status + ').');
                return;
            }

            try {
                json = JSON.parse(xhr.responseText);
            } catch (error) {
                failure('Réponse invalide du serveur.');
                return;
            }

            if (!json || typeof json.location !== 'string') {
                failure((json && (json.error || json.message)) ? (json.error || json.message) : 'Le serveur n’a retourné aucune URL.');
                return;
            }

            success(json.location);
        };

        xhr.onerror = function () {
            failure('Impossible de téléverser l’image.');
        };

        var formData = new FormData();
        formData.append('file', blobInfo.blob(), blobInfo.filename());
        xhr.send(formData);
    }

    function pickAndUploadImage(editor, uploadUrl, callback) {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';

        input.onchange = function () {
            if (!input.files || !input.files[0]) {
                return;
            }

            var file = input.files[0];
            var reader = new FileReader();

            reader.onload = function () {
                var id = 'blobid' + Date.now();
                var blobCache = editor.editorUpload.blobCache;
                var base64 = reader.result.split(',')[1];
                var blobInfo = blobCache.create(id, file, base64);
                blobCache.add(blobInfo);

                uploadImage(blobInfo, function (location) {
                    if (typeof callback === 'function') {
                        callback(location, { alt: file.name });
                    } else {
                        editor.insertContent('<img src="' + location + '" alt="' + editor.dom.encode(file.name) + '">');
                    }
                }, function (message) {
                    editor.notificationManager.open({
                        text: message,
                        type: 'error'
                    });
                }, null, uploadUrl);
            };

            reader.readAsDataURL(file);
        };

        input.click();
    }

    function normalizeConfig(config) {
        var uploadUrl = config.images_upload_url;
        var userSetup = config.setup;
        var finalConfig = $.extend(true, {}, config, getThemeConfig(), {
            language: config.language || 'fr_FR',
            language_url: config.language_url,
            promotion: false,
            branding: false,
            menubar: 'file edit view insert format table tools help',
            statusbar: true,
            elementpath: true,
            paste_data_images: true,
            automatic_uploads: true,
            images_upload_credentials: true,
            image_advtab: true,
            image_caption: true,
            image_title: true,
            convert_urls: false,
            relative_urls: false,
            remove_script_host: false,
            browser_spellcheck: true,
            toolbar_mode: 'wrap',
            toolbar_sticky: true,
            toolbar_sticky_offset: 20,
            contextmenu: 'undo redo | blocks | inserttable | cell row column deletetable | link image',
            toolbar: config.toolbar || [
                'undo redo | blocks | bold italic underline strikethrough | forecolor backcolor | alignleft aligncenter alignright alignjustify',
                'pt_h2 pt_h3 blockquote bullist numlist checklist outdent indent | link ptimageupload media table hr',
                'removeformat | emoticons charmap codesample | searchreplace visualblocks fullscreen preview code'
            ],
            plugins: config.plugins || [
                'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
                'anchor', 'searchreplace', 'wordcount', 'visualblocks', 'visualchars',
                'code', 'fullscreen', 'insertdatetime', 'media', 'nonbreaking',
                'table', 'directionality', 'emoticons', 'template', 'paste',
                'help', 'quickbars', 'codesample'
            ],
            quickbars_selection_toolbar: 'bold italic underline | forecolor backcolor | blockquote quicklink h2 h3',
            quickbars_insert_toolbar: 'quickimage quicktable hr',
            content_style: getContentStyle(),
            file_picker_types: 'image',
            images_upload_handler: function (blobInfo, success, failure, progress) {
                uploadImage(blobInfo, success, failure, progress, uploadUrl);
            },
            file_picker_callback: function (callback, value, meta) {
                if (meta.filetype === 'image') {
                    pickAndUploadImage(this, uploadUrl, callback);
                }
            },
            setup: function (editor) {
                editor.ui.registry.addButton('pt_h2', {
                    text: 'H2',
                    tooltip: 'Titre 2 (Alt+2)',
                    onAction: function () {
                        editor.execCommand('mceToggleFormat', false, 'h2');
                    }
                });

                editor.ui.registry.addButton('pt_h3', {
                    text: 'H3',
                    tooltip: 'Titre 3 (Alt+3)',
                    onAction: function () {
                        editor.execCommand('mceToggleFormat', false, 'h3');
                    }
                });

                editor.ui.registry.addButton('ptimageupload', {
                    icon: 'image',
                    tooltip: 'Téléverser une image',
                    onAction: function () {
                        pickAndUploadImage(editor, uploadUrl);
                    }
                });

                editor.on('init', function () {
                    if (cachedContent[editor.id] !== undefined) {
                        editor.setContent(cachedContent[editor.id]);
                        delete cachedContent[editor.id];
                    }
                });

                editor.addShortcut('alt+2', 'Titre 2', function () {
                    editor.execCommand('mceToggleFormat', false, 'h2');
                });
                editor.addShortcut('alt+3', 'Titre 3', function () {
                    editor.execCommand('mceToggleFormat', false, 'h3');
                });
                editor.addShortcut('alt+q', 'Citation', function () {
                    editor.execCommand('mceBlockQuote');
                });
                editor.addShortcut('alt+k', 'Lien', function () {
                    editor.execCommand('mceLink');
                });
                editor.addShortcut('alt+i', 'Téléverser une image', function () {
                    pickAndUploadImage(editor, uploadUrl);
                });
                editor.addShortcut('alt+f', 'Plein écran', function () {
                    editor.execCommand('mceFullScreen');
                });
                editor.addShortcut('alt+c', 'Code source', function () {
                    editor.execCommand('mceCodeEditor');
                });

                if (typeof userSetup === 'function') {
                    userSetup(editor);
                }
            }
        });

        if (!finalConfig.language_url) {
            delete finalConfig.language_url;
        }

        return finalConfig;
    }

    function getConfigKey(config) {
        if (config.selector) {
            return config.selector;
        }

        if (config.target && config.target.id) {
            return '#' + config.target.id;
        }

        return 'tinymce-' + Object.keys(storedConfigs).length;
    }

    function initTinyMCE(config) {
        if (!window.tinymce || !config || !config.images_upload_url) {
            return;
        }

        var key = getConfigKey(config);
        storedConfigs[key] = $.extend(true, {}, config);
        return window.tinymce.init(normalizeConfig(config));
    }

    function refreshTinyMCETheme() {
        if (!window.tinymce || !window.tinymce.editors || window.tinymce.editors.length === 0) {
            return;
        }

        window.tinymce.editors.forEach(function (editor) {
            cachedContent[editor.id] = editor.getContent({ format: 'raw' });
            editor.save();
            editor.remove();
        });

        Object.keys(storedConfigs).forEach(function (key) {
            initTinyMCE(storedConfigs[key]);
        });
    }

    window.PT_AdminInitTinyMCE = initTinyMCE;
    window.PT_AdminRefreshTinyMCETheme = refreshTinyMCETheme;
})(window, window.jQuery);

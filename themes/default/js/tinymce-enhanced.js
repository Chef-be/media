(function (window) {
    'use strict';

    function hasClass(node, className) {
        return !!(node && node.classList && node.classList.contains(className));
    }

    function getCookie(name) {
        var escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var match = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'));
        return match ? decodeURIComponent(match[1]) : '';
    }

    function isDarkMode(config) {
        if (config && typeof config.is_dark_mode === 'boolean') {
            return config.is_dark_mode;
        }

        if (document.querySelector('link.night-mode-css')) {
            return true;
        }

        if (getCookie('mode') === 'night') {
            return true;
        }

        var toggle = document.getElementById('toggle-mode');
        if (toggle && toggle.checked) {
            return true;
        }

        return hasClass(document.body, 'night-mode') ||
            hasClass(document.body, 'dark') ||
            hasClass(document.documentElement, 'night-mode') ||
            hasClass(document.documentElement, 'dark');
    }

    function getThemeConfig(config) {
        return isDarkMode(config) ? {
            skin: 'oxide-dark',
            content_css: 'dark'
        } : {
            skin: 'oxide',
            content_css: 'default'
        };
    }

    function getContentStyle(config) {
        if (isDarkMode(config)) {
            return 'body{font-family:Inter,sans-serif;background:#0f172a;color:#e5e7eb;}a{color:#60a5fa;}img{max-width:100%;height:auto;}figure{margin:1.2rem 0;}figcaption{color:#94a3b8;}table{border-collapse:collapse;width:100%;}table td,table th{border:1px solid #334155;padding:8px;}blockquote{border-left:4px solid #60a5fa;margin:1rem 0;padding:0.5rem 1rem;color:#cbd5e1;background:#111827;border-radius:0 6px 6px 0;}pre{background:#020617;color:#e5e7eb;padding:12px;border-radius:8px;}';
        }

        return 'body{font-family:Inter,sans-serif;background:#ffffff;color:#111827;}a{color:#2563eb;}img{max-width:100%;height:auto;}figure{margin:1.2rem 0;}figcaption{color:#6b7280;}table{border-collapse:collapse;width:100%;}table td,table th{border:1px solid #d1d5db;padding:8px;}blockquote{border-left:4px solid #2563eb;margin:1rem 0;padding:0.5rem 1rem;color:#374151;background:#f8fafc;border-radius:0 6px 6px 0;}pre{background:#111827;color:#f9fafb;padding:12px;border-radius:8px;}';
    }

    function uploadImage(blobInfo, success, failure, progress, uploadUrl) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', uploadUrl);

        xhr.upload.onprogress = function (e) {
            if (e.lengthComputable && typeof progress === 'function') {
                progress((e.loaded / e.total) * 100);
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
            } catch (err) {
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
                var id = 'blobid' + (new Date()).getTime();
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

    function reinitEditors(selector, buildConfig) {
        var nodes = document.querySelectorAll(selector);
        var ids = [];

        Array.prototype.forEach.call(nodes, function (node, index) {
            if (!node.id) {
                node.id = 'pt-tinymce-' + index + '-' + Date.now();
            }
            ids.push(node.id);
        });

        if (window.tinymce) {
            tinymce.triggerSave();
            ids.forEach(function (id) {
                var editor = tinymce.get(id);
                if (editor) {
                    editor.remove();
                }
            });
        }

        tinymce.init(buildConfig());
    }

    window.PT_SiteInitTinyMCE = function (config) {
        if (!window.tinymce || !config || !config.images_upload_url) {
            return;
        }

        var baseConfig = Object.assign({}, config);
        var uploadUrl = baseConfig.images_upload_url;
        var userSetup = baseConfig.setup;

        function buildConfig() {
            var initConfig = Object.assign({}, baseConfig, getThemeConfig(baseConfig), {
                menubar: 'file edit view insert format table tools help',
                branding: false,
                promotion: false,
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
                quickbars_selection_toolbar: 'bold italic underline | forecolor backcolor | blockquote quicklink h2 h3',
                quickbars_insert_toolbar: 'quickimage quicktable hr',
                toolbar: baseConfig.toolbar || 'undo redo | blocks fontfamily fontsize | bold italic underline strikethrough | forecolor backcolor removeformat | alignleft aligncenter alignright alignjustify | bullist numlist checklist outdent indent | link image media table blockquote hr | emoticons charmap codesample | preview fullscreen code | ptimageupload',
                plugins: baseConfig.plugins || [
                    'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
                    'anchor', 'searchreplace', 'wordcount', 'visualblocks', 'visualchars',
                    'code', 'fullscreen', 'insertdatetime', 'media', 'nonbreaking',
                    'table', 'directionality', 'emoticons', 'template', 'paste',
                    'help', 'quickbars', 'codesample'
                ],
                content_style: getContentStyle(baseConfig),
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
                    editor.ui.registry.addButton('ptimageupload', {
                        icon: 'image',
                        tooltip: 'Téléverser une image',
                        onAction: function () {
                            pickAndUploadImage(editor, uploadUrl);
                        }
                    });

                    if (typeof userSetup === 'function') {
                        userSetup(editor);
                    }
                }
            });

            if (!initConfig.language) {
                delete initConfig.language;
            }

            if (!initConfig.language_url) {
                delete initConfig.language_url;
            }

            return initConfig;
        }

        reinitEditors(baseConfig.selector, buildConfig);

        if (!window.__ptSiteTinyMCEModeListenerBound) {
            window.__ptSiteTinyMCEModeListenerBound = true;
            document.addEventListener('change', function (event) {
                if (event.target && event.target.id === 'toggle-mode' && window.__ptSiteTinyMCEConfigs) {
                    window.setTimeout(function () {
                        window.__ptSiteTinyMCEConfigs.forEach(function (siteConfig) {
                            siteConfig.is_dark_mode = isDarkMode(siteConfig);
                            reinitEditors(siteConfig.selector, function () {
                                return window.__ptSiteTinyMCEBuildConfig(siteConfig);
                            });
                        });
                    }, 50);
                }
            });
        }

        window.__ptSiteTinyMCEConfigs = window.__ptSiteTinyMCEConfigs || [];
        window.__ptSiteTinyMCEBuildConfig = function (siteConfig) {
            var previousConfig = baseConfig;
            baseConfig = siteConfig;
            var builtConfig = buildConfig();
            baseConfig = previousConfig;
            return builtConfig;
        };

        if (window.__ptSiteTinyMCEConfigs.indexOf(baseConfig) === -1) {
            window.__ptSiteTinyMCEConfigs.push(baseConfig);
        }
    };
})(window);

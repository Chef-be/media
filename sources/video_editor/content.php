<?php
if (IS_LOGGED == false) {
    header("Location: " . PT_Link('login'));
    exit();
}
if (empty($_GET['id'])) {
    header("Location: " . PT_Link(''));
    exit();
}
$id    = PT_Secure($_GET['id']);
$video = $db->where('id', $id)->getOne(T_VIDEOS);
if (empty($video)) {
    header("Location: " . PT_Link(''));
    exit();
}
if ($video->user_id != $pt->user->id && PT_IsAdmin() == false) {
    header("Location: " . PT_Link(''));
    exit();
}

$pt->page_url_ = $pt->config->site_url.'/video_editor?id='.$id;
$pt->page        = 'video_editor';
$pt->title       = $lang->video_editor . ' | ' . $pt->config->title;
$pt->description = $pt->config->description;
$pt->keyword     = $pt->config->keyword;
$pt->content     = PT_LoadPage('video_editor/content', array(
    'ID' => $video->id,
    'TITLE' => PT_Secure($video->title),
    'THUMBNAIL' => $video->thumbnail,
    'VIDEO_LOCATION' => $video->video_location
));

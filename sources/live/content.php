<?php
if (!IS_LOGGED) {
	header('Location: ' . PT_Link('404'));
	exit;
}
if ($pt->config->live_video == 1 && ($pt->config->who_use_live == 'all' || ($pt->config->who_use_live == 'admin' && PT_IsAdmin()) || ($pt->config->who_use_live == 'pro' && $pt->user->is_pro > 0))) {
}
else{
	header('Location: ' . PT_Link('404'));
	exit;
}
$if_live = $db->where('user_id',$pt->user->id)->where('stream_name','','!=')->where('live_time',time() - 5,'>=')->getValue(T_VIDEOS,'COUNT(*)');
$pt->active_live_video = null;
$pt->active_live_context_json = 'null';

$active_live = $db->where('user_id', $pt->user->id)
    ->where('type', 'live')
    ->where('live_ended', 0)
    ->where('stream_name', '', '!=')
    ->where('live_time', time() - PT_GetLiveHeartbeatWindow(), '>=')
    ->orderBy('id', 'DESC')
    ->getOne(T_VIDEOS);

if (!empty($active_live)) {
    $pt->active_live_video = $active_live;
    $active_target = PT_GetLiveTargetForVideo($active_live);
    $active_metadata = PT_GetLiveMetadata($active_live);
    $active_provider = PT_GetLiveProvider($active_live);
    $active_stream_mode = (!empty($active_metadata['stream_mode']) ? $active_metadata['stream_mode'] : 'browser');
    $active_browser_publish_url = (!empty($active_metadata['browser_publish_url']) ? $active_metadata['browser_publish_url'] : '');
    $active_browser_whip_url = (!empty($active_metadata['browser_whip_url']) ? $active_metadata['browser_whip_url'] : '');
    $active_browser_publisher_js_url = (!empty($active_metadata['browser_publisher_js_url']) ? $active_metadata['browser_publisher_js_url'] : '');

    if ($active_provider == 'chef_live' && $active_stream_mode == 'browser') {
        if ($active_browser_publish_url == '') {
            $active_browser_publish_url = PT_BuildBrowserPublishUrl($active_target, $active_live->stream_name);
        }
        if ($active_browser_whip_url == '') {
            $active_browser_whip_url = PT_BuildChefLiveBrowserWhipUrl($active_live->stream_name);
        }
        if ($active_browser_publisher_js_url == '') {
            $active_browser_publisher_js_url = PT_BuildChefLiveBrowserPublisherScriptUrl($active_live->stream_name);
        }
    }

    $active_context = array(
        'post_id' => intval($active_live->id),
        'title' => $active_live->title,
        'stream_name' => $active_live->stream_name,
        'provider' => $active_provider,
        'provider_label' => (!empty($active_target['name']) ? $active_target['name'] : ''),
        'server_id' => (!empty($active_target['server_id']) ? $active_target['server_id'] : ''),
        'stream_mode' => $active_stream_mode,
        'publish_url' => (!empty($active_metadata['publish_url']) ? $active_metadata['publish_url'] : ''),
        'playback_url' => (!empty($active_metadata['playback_url']) ? $active_metadata['playback_url'] : ''),
        'stream_key' => (!empty($active_metadata['stream_key']) ? $active_metadata['stream_key'] : $active_live->stream_name),
        'webrtc_url' => (!empty($active_metadata['webrtc_url']) ? $active_metadata['webrtc_url'] : ''),
        'browser_publish_url' => $active_browser_publish_url,
        'browser_whip_url' => $active_browser_whip_url,
        'browser_publisher_js_url' => $active_browser_publisher_js_url
    );
    $pt->active_live_context_json = json_encode($active_context);
}
if (PT_IsAgoraEnabled()) {
    include_once 'assets/libs/AgoraDynamicKey/sample/RtcTokenBuilderSample.php';
}
$db->where('time',time()-60,'<')->delete(T_LIVE_SUB);
$pt->live_targets = PT_GetAvailableLiveTargets();
$pt->live_targets_json = json_encode($pt->live_targets);

$pt->page_url_ = $pt->config->site_url.'/live';
$pt->title       = $lang->live . ' | ' . $pt->config->title;
$pt->page        = "live";
$pt->description = $pt->config->description;
$pt->keyword     = @$pt->config->keyword;
$pt->content     = PT_LoadPage('live/content');

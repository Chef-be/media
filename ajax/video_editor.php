<?php
if (IS_LOGGED == false) {
    $data = array('status' => 403, 'message' => 'Not logged in');
    header('Content-Type: application/json'); echo json_encode($data); exit();
}
if (empty($_POST['video_id'])) {
    $data = array('status' => 400, 'message' => 'Missing video_id');
    header('Content-Type: application/json'); echo json_encode($data); exit();
}
$video_id = PT_Secure($_POST['video_id']);
$video = $db->where('id', $video_id)->getOne(T_VIDEOS);
if (empty($video)) {
    $data = array('status' => 404, 'message' => 'Video not found');
    header('Content-Type: application/json'); echo json_encode($data); exit();
}
if ($video->user_id != $pt->user->id && PT_IsAdmin() == false) {
    $data = array('status' => 403, 'message' => 'No permission');
    header('Content-Type: application/json'); echo json_encode($data); exit();
}
$now = time();
$edl_json = isset($_POST['edl']) ? $_POST['edl'] : '';
if (gettype($edl_json) != 'string') { $edl_json = json_encode($edl_json); }

if ($first == 'save') {
    $exists = $db->where('video_id',$video_id)->where('owner_id',$pt->user->id)->getOne('video_edits');
    $insert_data = array('video_id'=>$video_id,'owner_id'=>$pt->user->id,'status'=>'draft','edl_json'=>$edl_json,'updated_at'=>$now);
    if (empty($exists)) {
        $insert_data['created_at'] = $now;
        $insert_data['version'] = 1;
        $db->insert('video_edits',$insert_data);
    } else {
        $db->where('id',$exists->id)->update('video_edits',$insert_data);
    }
    $data = array('status'=>200);
    header('Content-Type: application/json'); echo json_encode($data); exit();
}

if ($first == 'render') {
    $edit = $db->where('video_id',$video_id)->where('owner_id',$pt->user->id)->getOne('video_edits');
    if (empty($edit)) {
        $db->insert('video_edits', array('video_id'=>$video_id,'owner_id'=>$pt->user->id,'status'=>'queued','edl_json'=>$edl_json,'version'=>1,'created_at'=>$now,'updated_at'=>$now));
        $edit_id = $db->insertId();
    } else {
        $edit_id = $edit->id;
        $db->where('id',$edit_id)->update('video_edits', array('status'=>'queued','edl_json'=>$edl_json,'updated_at'=>$now));
    }
    $task_id = $db->insert('edit_tasks', array('edit_id'=>$edit_id,'type'=>'render','progress'=>10,'log'=>'queued','created_at'=>$now,'updated_at'=>$now));
    $data = array('status'=>200,'job_id'=>$task_id);
    header('Content-Type: application/json'); echo json_encode($data); exit();
}

if ($first == 'status') {
    if (empty($_POST['job_id'])) {
        $data = array('status'=>400,'message'=>'Missing job id'); header('Content-Type: application/json'); echo json_encode($data); exit();
    }
    $task = $db->where('id', PT_Secure($_POST['job_id']))->getOne('edit_tasks');
    if (empty($task)) { $data=array('status'=>404,'message'=>'Job not found'); header('Content-Type: application/json'); echo json_encode($data); exit(); }
    $data = array('status'=>200,'progress'=>(int)$task->progress);
    header('Content-Type: application/json'); echo json_encode($data); exit();
}

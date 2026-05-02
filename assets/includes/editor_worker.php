<?php
// Simple worker to process queued edit_tasks
$task = $db->where('progress', 10)->orderBy('id','asc')->getOne('edit_tasks');
if ($task) {
    $edit = $db->where('id',$task->edit_id)->getOne('video_edits');
    if ($edit) {
        $data = json_decode($edit->edl_json,true);
        $video = $db->where('id',$edit->video_id)->getOne(T_VIDEOS);
        if ($video) {
            $input = $video->video_location;
            if (strpos($input, 'http') === 0) {
                $input = str_replace($pt->config->site_url . '/', './', $input);
            }
            if (!file_exists($input)) {
                $input = './' . ltrim($input,'/');
            }
            $out_dir = 'upload/videos/edits/'.$video->id;
            if (!file_exists($out_dir)) { @mkdir($out_dir, 0777, true); }
            $version = (int)$edit->version + 1;
            $output = $out_dir.'/v'.$version.'_video.mp4';

            $filters = array();
            // Cuts not fully implemented in worker V1; we rely on re-encode with filters gradually.
            // Stabilization
            if (!empty($data['stabilization']) && $data['stabilization'] != 'off') {
                if ($data['stabilization'] == 'deshake') {
                    $filters[] = 'deshake';
                }
                if ($data['stabilization'] == 'vidstab') {
                    // try vidstab; ignore if not available
                    $detect = $out_dir.'/transforms.trf';
                    $cmd1 = $pt->config->ffmpeg_binary_file.' -y -i "'.$input.'" -vf vidstabdetect=shakiness=5:accuracy=15:result='.$detect.' -f null - 2>&1';
                    @shell_exec($cmd1);
                    $filters[] = 'vidstabtransform=smoothing=15:input='.$detect;
                }
            }
            // Quality preset
            switch (!empty($data['quality'])?$data['quality']:'none') {
                case 'clean_light':
                    $filters[] = 'hqdn3d=1.5:1.5:6:6,unsharp=5:5:0.5:5:5:0';
                    break;
                case 'sharp_plus':
                    $filters[] = 'unsharp=7:7:1.5:7:7:0.5';
                    break;
                case 'denoise_strong':
                    $filters[] = 'hqdn3d=4:4:10:10';
                    break;
                case 'upscale_1080':
                    $filters[] = 'scale=1920:1080:flags=lanczos';
                    break;
            }
            $vf = '';
            if (!empty($filters)) { $vf = ' -vf "' . implode(',', $filters) . '" '; }
            $cmd = $pt->config->ffmpeg_binary_file.' -y -i "'.$input.'" '.$vf.' -preset fast -crf 23 -c:v libx264 -c:a aac -movflags +faststart "'.$output.'" 2>&1';
            $db->where('id',$task->id)->update('edit_tasks', array('progress'=>30,'log'=>$cmd,'updated_at'=>time()));
            @shell_exec($cmd);
            if (file_exists($output) && filesize($output) > 1000) {
                // Replace original
                $db->where('id',$video->id)->update(T_VIDEOS, array('video_location' => $output));
                $db->where('id',$edit->id)->update('video_edits', array('status'=>'done','version'=>$version,'output_path'=>$output,'updated_at'=>time()));
                $db->where('id',$task->id)->update('edit_tasks', array('progress'=>100,'log'=>'done','updated_at'=>time()));
            } else {
                $db->where('id',$edit->id)->update('video_edits', array('status'=>'error','updated_at'=>time()));
                $db->where('id',$task->id)->update('edit_tasks', array('progress'=>-1,'log'=>'failed','updated_at'=>time()));
            }
        } else {
            $db->where('id',$task->id)->update('edit_tasks', array('progress'=>-1,'log'=>'no video','updated_at'=>time()));
        }
    } else {
        $db->where('id',$task->id)->update('edit_tasks', array('progress'=>-1,'log'=>'no edit','updated_at'=>time()));
    }
}

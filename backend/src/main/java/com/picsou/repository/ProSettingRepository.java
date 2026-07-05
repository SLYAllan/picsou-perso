package com.picsou.repository;

import com.picsou.model.ProSetting;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ProSettingRepository extends JpaRepository<ProSetting, Long> {
    List<ProSetting> findAllByMemberId(Long memberId);
    Optional<ProSetting> findByMemberIdAndSettingKey(Long memberId, String settingKey);
}
